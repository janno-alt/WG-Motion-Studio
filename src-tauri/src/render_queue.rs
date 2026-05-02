use std::sync::Arc;

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tokio::sync::{Mutex as TokioMutex, mpsc};

use crate::commands::now_ms;
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::render::{RenderRequest, build_render_plan};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RenderRow {
    pub id: String,
    pub project_id: String,
    pub preset: String,
    pub output_path: String,
    pub status: String,
    pub progress: f64,
    pub error: Option<String>,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub created_at: i64,
}

fn read_render_row(row: &rusqlite::Row) -> rusqlite::Result<RenderRow> {
    Ok(RenderRow {
        id: row.get(0)?,
        project_id: row.get(1)?,
        preset: row.get(2)?,
        output_path: row.get(3)?,
        status: row.get(4)?,
        progress: row.get(5)?,
        error: row.get(6)?,
        started_at: row.get(7)?,
        finished_at: row.get(8)?,
        created_at: row.get(9)?,
    })
}

const COLUMNS: &str =
    "id, project_id, preset, output_path, status, progress, error, started_at, finished_at, created_at";

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "stage")]
pub enum QueueEvent {
    Queued { render_id: String },
    Started { render_id: String },
    Progress {
        render_id: String,
        frame: u64,
        total_frames: Option<u64>,
    },
    Done { render_id: String, output_path: String },
    Failed { render_id: String, message: String },
    Cancelled { render_id: String },
}

struct RunningSlot {
    render_id: String,
    child: CommandChild,
}

pub struct RenderQueue {
    pub sender: mpsc::Sender<RenderRequest>,
    pub running: Arc<TokioMutex<Option<RunningSlot>>>,
}

impl RenderQueue {
    pub fn spawn(app: AppHandle) -> Self {
        let (tx, rx) = mpsc::channel::<RenderRequest>(64);
        let running = Arc::new(TokioMutex::new(None));
        let running_clone = running.clone();
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            run_worker(app_clone, running_clone, rx).await;
        });
        Self { sender: tx, running }
    }
}

/// Reset any 'running' rows left over from a previous app session — those
/// processes died with the previous app and can't recover. Called once at
/// startup before the worker begins.
pub fn recovery_sweep(conn: &Connection) -> AppResult<()> {
    let updated = conn.execute(
        "UPDATE renders
            SET status = 'failed',
                error = COALESCE(error, 'app restarted while render was running'),
                finished_at = COALESCE(finished_at, ?1)
          WHERE status = 'running'",
        params![now_ms()],
    )?;
    if updated > 0 {
        eprintln!("[render_queue] recovery sweep: marked {updated} stale running render(s) as failed");
    }
    Ok(())
}

async fn run_worker(
    app: AppHandle,
    running: Arc<TokioMutex<Option<RunningSlot>>>,
    mut rx: mpsc::Receiver<RenderRequest>,
) {
    while let Some(request) = rx.recv().await {
        let render_id = request.render_id.clone();

        // Check current DB status — if user cancelled while it was queued,
        // skip execution.
        if get_status(&app, &render_id).map(|s| s == "cancelled").unwrap_or(false) {
            let _ = app.emit("render-queue", QueueEvent::Cancelled { render_id });
            continue;
        }

        let _ = update_status(&app, &render_id, "running", Some(now_ms()), None, None);
        let _ = app.emit("render-queue", QueueEvent::Started { render_id: render_id.clone() });

        match execute_one(&app, &running, &request).await {
            Ok(()) => {
                // execute_one already emitted Done / Cancelled and updated the row.
            }
            Err(err) => {
                let msg = err.to_string();
                let _ = update_status(
                    &app,
                    &render_id,
                    "failed",
                    None,
                    Some(now_ms()),
                    Some(&msg),
                );
                let _ = app.emit(
                    "render-queue",
                    QueueEvent::Failed { render_id: render_id.clone(), message: msg },
                );
            }
        }
    }
}

async fn execute_one(
    app: &AppHandle,
    running: &Arc<TokioMutex<Option<RunningSlot>>>,
    request: &RenderRequest,
) -> AppResult<()> {
    let plan = build_render_plan(request)?;
    let render_id = request.render_id.clone();

    let cmd = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| AppError::Other(format!("ffmpeg sidecar: {e}")))?
        .args(&plan.args);

    let (mut rx, child) = cmd
        .spawn()
        .map_err(|e| AppError::Other(format!("ffmpeg spawn: {e}")))?;

    {
        let mut slot = running.lock().await;
        *slot = Some(RunningSlot { render_id: render_id.clone(), child });
    }

    let mut error_buffer = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let s = String::from_utf8_lossy(&line);
                for kv in s.split('\n') {
                    if let Some(n) = kv.trim().strip_prefix("frame=") {
                        if let Ok(f) = n.parse::<u64>() {
                            let progress = plan
                                .total_frames
                                .map(|t| (f as f64 / t as f64).clamp(0.0, 1.0))
                                .unwrap_or(0.0);
                            let _ = update_progress(app, &render_id, progress);
                            let _ = app.emit(
                                "render-queue",
                                QueueEvent::Progress {
                                    render_id: render_id.clone(),
                                    frame: f,
                                    total_frames: plan.total_frames,
                                },
                            );
                        }
                    }
                }
            }
            CommandEvent::Stderr(line) => {
                let s = String::from_utf8_lossy(&line);
                if s.contains("Error") || s.contains("error") {
                    error_buffer.push_str(&s);
                }
            }
            CommandEvent::Error(err) => {
                error_buffer.push_str(&err);
            }
            CommandEvent::Terminated(payload) => {
                let cancelled =
                    get_status(app, &render_id).map(|s| s == "cancelled").unwrap_or(false);
                {
                    let mut slot = running.lock().await;
                    *slot = None;
                }
                if cancelled {
                    let _ = update_status(app, &render_id, "cancelled", None, Some(now_ms()), None);
                    let _ = app.emit(
                        "render-queue",
                        QueueEvent::Cancelled { render_id: render_id.clone() },
                    );
                    return Ok(());
                }
                if !matches!(payload.code, Some(0)) {
                    let msg = if !error_buffer.is_empty() {
                        error_buffer.clone()
                    } else {
                        format!("ffmpeg exited with code {:?}", payload.code)
                    };
                    return Err(AppError::Other(msg));
                }
                let _ = update_status(
                    app,
                    &render_id,
                    "done",
                    None,
                    Some(now_ms()),
                    None,
                );
                let _ = update_progress(app, &render_id, 1.0);
                let _ = app.emit(
                    "render-queue",
                    QueueEvent::Done {
                        render_id: render_id.clone(),
                        output_path: request.output_path.clone(),
                    },
                );
                return Ok(());
            }
            _ => {}
        }
    }

    Ok(())
}

fn get_status(app: &AppHandle, render_id: &str) -> AppResult<String> {
    let state: State<'_, DbState> = app
        .try_state::<DbState>()
        .ok_or_else(|| AppError::Other("DbState missing".into()))?;
    let conn = state.conn.lock().unwrap();
    Ok(conn.query_row(
        "SELECT status FROM renders WHERE id = ?1",
        params![render_id],
        |row| row.get(0),
    )?)
}

fn update_status(
    app: &AppHandle,
    render_id: &str,
    status: &str,
    started_at: Option<i64>,
    finished_at: Option<i64>,
    error: Option<&str>,
) -> AppResult<()> {
    let state: State<'_, DbState> = app
        .try_state::<DbState>()
        .ok_or_else(|| AppError::Other("DbState missing".into()))?;
    let conn = state.conn.lock().unwrap();
    if let Some(s) = started_at {
        conn.execute(
            "UPDATE renders SET status = ?1, started_at = COALESCE(started_at, ?2) WHERE id = ?3",
            params![status, s, render_id],
        )?;
    } else if let Some(f) = finished_at {
        conn.execute(
            "UPDATE renders SET status = ?1, finished_at = ?2, error = ?3 WHERE id = ?4",
            params![status, f, error, render_id],
        )?;
    } else {
        conn.execute(
            "UPDATE renders SET status = ?1, error = ?2 WHERE id = ?3",
            params![status, error, render_id],
        )?;
    }
    Ok(())
}

fn update_progress(app: &AppHandle, render_id: &str, progress: f64) -> AppResult<()> {
    let state: State<'_, DbState> = app
        .try_state::<DbState>()
        .ok_or_else(|| AppError::Other("DbState missing".into()))?;
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE renders SET progress = ?1 WHERE id = ?2",
        params![progress, render_id],
    )?;
    Ok(())
}

/* ------------------------------------------------------------------ */
/*  Tauri commands                                                     */
/* ------------------------------------------------------------------ */

#[tauri::command]
pub async fn enqueue_render(
    app: AppHandle,
    request: RenderRequest,
) -> AppResult<String> {
    let queue = app
        .try_state::<RenderQueue>()
        .ok_or_else(|| AppError::Other("RenderQueue missing".into()))?;
    let id = request.render_id.clone();
    let now = now_ms();

    {
        let db = app
            .try_state::<DbState>()
            .ok_or_else(|| AppError::Other("DbState missing".into()))?;
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO renders (id, project_id, preset, output_path, status, progress, created_at)
             VALUES (?1, ?2, ?3, ?4, 'queued', 0, ?5)",
            params![
                id,
                request.project_id,
                request.preset.id,
                request.output_path,
                now,
            ],
        )?;
    }

    let _ = app.emit("render-queue", QueueEvent::Queued { render_id: id.clone() });

    queue
        .sender
        .send(request)
        .await
        .map_err(|e| AppError::Other(format!("queue send: {e}")))?;

    Ok(id)
}

#[tauri::command]
pub fn list_renders(
    db: State<'_, DbState>,
    project_id: Option<String>,
) -> AppResult<Vec<RenderRow>> {
    let conn = db.conn.lock().unwrap();
    let mut out = Vec::new();
    if let Some(pid) = project_id {
        let mut stmt = conn.prepare(&format!(
            "SELECT {COLUMNS} FROM renders WHERE project_id = ?1 ORDER BY created_at DESC"
        ))?;
        let rows = stmt.query_map(params![pid], read_render_row)?;
        for r in rows {
            out.push(r?);
        }
    } else {
        let mut stmt = conn.prepare(&format!(
            "SELECT {COLUMNS} FROM renders ORDER BY created_at DESC"
        ))?;
        let rows = stmt.query_map([], read_render_row)?;
        for r in rows {
            out.push(r?);
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn cancel_render(app: AppHandle, render_id: String) -> AppResult<()> {
    let queue = app
        .try_state::<RenderQueue>()
        .ok_or_else(|| AppError::Other("RenderQueue missing".into()))?;
    let _ = update_status(&app, &render_id, "cancelled", None, None, None);

    // If it's the currently-running render, kill the ffmpeg child. The worker's
    // Terminated event will then commit the cancelled status with finished_at.
    let mut slot = queue.running.lock().await;
    if let Some(running) = slot.as_ref() {
        if running.render_id == render_id {
            if let Some(taken) = slot.take() {
                let _ = taken.child.kill();
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn delete_render(db: State<'_, DbState>, render_id: String) -> AppResult<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute("DELETE FROM renders WHERE id = ?1", params![render_id])?;
    Ok(())
}
