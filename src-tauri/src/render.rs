use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use rusqlite::params;
use serde::Serialize;
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::fs_ops;

/// Serialized queue: Tauri keeps a single render running at a time to
/// avoid thrashing CPU / memory. Subsequent `render_*` calls wait for the
/// active job to finish.
static RENDER_LOCK: once_cell::sync::Lazy<Arc<Mutex<()>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(())));

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RenderProgress {
    pub item_id: String,
    pub phase: String, // "starting" | "bundling" | "rendering" | "done" | "error"
    pub frame: Option<u32>,
    pub total: Option<u32>,
    pub message: Option<String>,
}

pub async fn render_project_full(
    app: &AppHandle,
    project_id: &str,
    output_path: Option<&str>,
    format: &str,
) -> AppResult<String> {
    let _guard = RENDER_LOCK.lock().await;

    let (project_json, theme_json, presets_json) = {
        let state: tauri::State<'_, DbState> = app.state();
        let conn = state.conn.lock().unwrap();
        let proj = load_project_value(&conn, project_id)?;
        let theme_id = proj
            .get("clientId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::Other("project missing clientId".into()))?
            .to_string();
        let theme_str: String = conn.query_row(
            "SELECT data FROM themes WHERE id = ?1",
            params![theme_id],
            |r| r.get(0),
        )?;
        let theme_value: Value = serde_json::from_str(&theme_str)?;
        let mut presets = serde_json::Map::new();
        let mut stmt = conn.prepare("SELECT data FROM presets")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        for s in rows {
            let p: Value = serde_json::from_str(&s?)?;
            if let Some(id) = p.get("id").and_then(|v| v.as_str()) {
                presets.insert(id.to_string(), p);
            }
        }
        (proj, theme_value, Value::Object(presets))
    };

    let output_path = if let Some(p) = output_path {
        PathBuf::from(p)
    } else {
        let dir = fs_ops::ensure_project_dir(app, project_id)?.join("renders/full");
        fs::create_dir_all(&dir).ok();
        let ext = if format == "prores" { "mov" } else { "webm" };
        dir.join(format!("{project_id}.{ext}"))
    };

    let input = json!({
        "mode": "project",
        "project": project_json,
        "theme": theme_json,
        "presets": presets_json,
        "outputPath": output_path.to_string_lossy(),
        "format": format,
    });

    let tmp = std::env::temp_dir().join(format!("wg-render-project-{project_id}.json"));
    fs::write(&tmp, serde_json::to_string(&input)?)
        .map_err(|e| AppError::Other(format!("write tmp: {e}")))?;

    emit_progress(app, project_id, "starting", None, None, None);
    let project_root = std::env::var("WG_MOTION_STUDIO_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
    let script_path = project_root.join("scripts/render-item.mjs");

    let mut cmd = Command::new("node");
    cmd.current_dir(&project_root)
        .arg(&script_path)
        .arg(&tmp)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| AppError::Other(format!("spawn node: {e}")))?;
    let stdout = child.stdout.take().ok_or_else(|| AppError::Other("no stdout".into()))?;
    let mut reader = BufReader::new(stdout).lines();
    let app_clone = app.clone();
    let pid = project_id.to_string();

    let reader_handle = tokio::spawn(async move {
        while let Ok(Some(line)) = reader.next_line().await {
            if let Ok(event) = serde_json::from_str::<Value>(&line) {
                let phase = event.get("type").and_then(|v| v.as_str()).unwrap_or("progress").to_string();
                let frame = event.get("frame").and_then(|v| v.as_u64()).map(|n| n as u32);
                let total = event.get("total").and_then(|v| v.as_u64()).map(|n| n as u32);
                let message = event.get("message").and_then(|v| v.as_str()).map(String::from);
                emit_progress(&app_clone, &pid, &phase, frame, total, message);
            }
        }
    });

    let status = child.wait().await.map_err(|e| AppError::Other(format!("wait: {e}")))?;
    let _ = reader_handle.await;
    let _ = fs::remove_file(&tmp);

    if !status.success() {
        let code = status.code().unwrap_or(-1);
        emit_progress(app, project_id, "error", None, None, Some(format!("exit {code}")));
        return Err(AppError::Other(format!("render exit {code}")));
    }
    emit_progress(app, project_id, "done", None, None, None);
    Ok(output_path.to_string_lossy().to_string())
}

fn load_project_value(conn: &rusqlite::Connection, project_id: &str) -> AppResult<Value> {
    let row: (String, String, String, String, Option<String>, String, f64, i64, String) = conn
        .query_row(
            "SELECT id, name, client_id, srt_path, video_path, video_format, video_duration, fps, settings
               FROM projects WHERE id = ?1",
            params![project_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("project:{project_id}")),
            other => other.into(),
        })?;

    let mut stmt = conn.prepare(
        "SELECT id, timestamp, duration, tier, component_type, brief, srt_context, status,
                preview_url, final_asset_url, base_state, animation, style_variant
           FROM plan_items WHERE project_id = ?1 ORDER BY sort_order ASC",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        let id: String = row.get(0)?;
        let timestamp: f64 = row.get(1)?;
        let duration: f64 = row.get(2)?;
        let tier: i64 = row.get(3)?;
        let component_type: Option<String> = row.get(4)?;
        let brief: String = row.get(5)?;
        let srt_context: String = row.get(6)?;
        let status: String = row.get(7)?;
        let preview_url: Option<String> = row.get(8)?;
        let final_asset_url: Option<String> = row.get(9)?;
        let base_state: String = row.get(10)?;
        let animation: String = row.get(11)?;
        let style_variant: Option<String> = row.get(12)?;
        Ok(json!({
            "id": id,
            "timestamp": timestamp,
            "duration": duration,
            "tier": tier,
            "componentType": component_type,
            "brief": brief,
            "srtContext": srt_context,
            "status": status,
            "previewUrl": preview_url,
            "finalAssetUrl": final_asset_url,
            "baseState": serde_json::from_str::<Value>(&base_state).unwrap_or(Value::Null),
            "animation": serde_json::from_str::<Value>(&animation).unwrap_or(Value::Null),
            "styleVariant": style_variant,
        }))
    })?;
    let mut items: Vec<Value> = Vec::new();
    for r in rows {
        items.push(r?);
    }

    Ok(json!({
        "id": row.0,
        "name": row.1,
        "clientId": row.2,
        "srtPath": row.3,
        "videoPath": row.4,
        "videoFormat": row.5,
        "videoDuration": row.6,
        "fps": row.7,
        "settings": serde_json::from_str::<Value>(&row.8).unwrap_or(Value::Null),
        "planItems": items,
    }))
}

pub async fn render_single_item(
    app: &AppHandle,
    project_id: &str,
    item_id: &str,
    override_output: Option<&str>,
    format: &str,
) -> AppResult<String> {
    let _guard = RENDER_LOCK.lock().await;

    // 1. Gather input — project, item, theme, preset map.
    let (item_json, theme_json, presets_json, fps) = {
        let state: tauri::State<'_, DbState> = app.state();
        let conn = state.conn.lock().unwrap();
        let row: (String, String, String, i64, i64) = conn.query_row(
            "SELECT pi.id, pi.brief, p.client_id, p.fps, t.updated_at
               FROM plan_items pi
               JOIN projects p ON p.id = pi.project_id
               JOIN themes t ON t.id = p.client_id
              WHERE pi.id = ?1",
            params![item_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        ).map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("plan_item:{item_id}")),
            other => other.into(),
        })?;

        let item_value = load_plan_item(&conn, &row.0)?;
        let theme_str: String = conn.query_row(
            "SELECT data FROM themes WHERE id = ?1",
            params![row.2],
            |r| r.get(0),
        )?;
        let theme_value: Value = serde_json::from_str(&theme_str)?;
        let mut presets = serde_json::Map::new();
        let mut stmt = conn.prepare("SELECT data FROM presets")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        for s in rows {
            let p: Value = serde_json::from_str(&s?)?;
            if let Some(id) = p.get("id").and_then(|v| v.as_str()) {
                presets.insert(id.to_string(), p);
            }
        }
        (item_value, theme_value, Value::Object(presets), row.3)
    };

    // 2. Decide output path.
    let output_path = if let Some(p) = override_output {
        PathBuf::from(p)
    } else {
        let overlays = fs_ops::ensure_project_dir(app, project_id)?.join("renders/overlays");
        fs::create_dir_all(&overlays).ok();
        let ext = if format == "prores" { "mov" } else { "webm" };
        overlays.join(format!("{item_id}.{ext}"))
    };

    // 3. Write a temp JSON file with everything the Node script needs.
    let input = json!({
        "item": item_json,
        "theme": theme_json,
        "presets": presets_json,
        "fps": fps,
        "outputPath": output_path.to_string_lossy(),
        "format": format,
    });
    let tmp = std::env::temp_dir().join(format!("wg-render-{item_id}.json"));
    fs::write(&tmp, serde_json::to_string(&input)?)
        .map_err(|e| AppError::Other(format!("write tmp: {e}")))?;

    emit_progress(app, item_id, "starting", None, None, None);

    // 4. Resolve the project root so we can run the render script against
    //    the bundled Remotion entry. In dev, CWD is the repo root; in a
    //    bundled app this would use `app.path().resource_dir()`. For now we
    //    honour $WG_MOTION_STUDIO_ROOT → current_dir fallback.
    let project_root = std::env::var("WG_MOTION_STUDIO_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());

    let script_path = project_root.join("scripts/render-item.mjs");

    // 5. Spawn node.
    let mut cmd = Command::new("node");
    cmd.current_dir(&project_root)
        .arg(&script_path)
        .arg(&tmp)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Other(format!("spawn node: {e}")))?;

    let stdout = child.stdout.take().ok_or_else(|| AppError::Other("no stdout".into()))?;
    let mut reader = BufReader::new(stdout).lines();
    let app_clone = app.clone();
    let item_id_clone = item_id.to_string();

    // Stream JSON-per-line progress events to the frontend.
    let reader_handle = tokio::spawn(async move {
        while let Ok(Some(line)) = reader.next_line().await {
            let parsed: Result<Value, _> = serde_json::from_str(&line);
            if let Ok(event) = parsed {
                let phase = event.get("type").and_then(|v| v.as_str()).unwrap_or("progress").to_string();
                let frame = event.get("frame").and_then(|v| v.as_u64()).map(|n| n as u32);
                let total = event.get("total").and_then(|v| v.as_u64()).map(|n| n as u32);
                let message = event.get("message").and_then(|v| v.as_str()).map(String::from);
                emit_progress(&app_clone, &item_id_clone, &phase, frame, total, message);
            }
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| AppError::Other(format!("wait: {e}")))?;
    let _ = reader_handle.await;
    let _ = fs::remove_file(&tmp);

    if !status.success() {
        let code = status.code().unwrap_or(-1);
        emit_progress(app, item_id, "error", None, None, Some(format!("exit {code}")));
        return Err(AppError::Other(format!("render exit {code}")));
    }

    emit_progress(app, item_id, "done", None, None, None);
    Ok(output_path.to_string_lossy().to_string())
}

fn emit_progress(
    app: &AppHandle,
    item_id: &str,
    phase: &str,
    frame: Option<u32>,
    total: Option<u32>,
    message: Option<String>,
) {
    let _ = app.emit(
        "render:progress",
        RenderProgress {
            item_id: item_id.to_string(),
            phase: phase.to_string(),
            frame,
            total,
            message,
        },
    );
}

/* ------------------------------------------------------------------ */
/*  Plan item reassembly                                               */
/* ------------------------------------------------------------------ */

fn load_plan_item(conn: &rusqlite::Connection, item_id: &str) -> AppResult<Value> {
    conn.query_row(
        "SELECT id, timestamp, duration, tier, component_type, brief, srt_context, status,
                preview_url, final_asset_url, base_state, animation, style_variant
           FROM plan_items WHERE id = ?1",
        params![item_id],
        |row| {
            let id: String = row.get(0)?;
            let timestamp: f64 = row.get(1)?;
            let duration: f64 = row.get(2)?;
            let tier: i64 = row.get(3)?;
            let component_type: Option<String> = row.get(4)?;
            let brief: String = row.get(5)?;
            let srt_context: String = row.get(6)?;
            let status: String = row.get(7)?;
            let preview_url: Option<String> = row.get(8)?;
            let final_asset_url: Option<String> = row.get(9)?;
            let base_state: String = row.get(10)?;
            let animation: String = row.get(11)?;
            let style_variant: Option<String> = row.get(12)?;
            Ok(json!({
                "id": id,
                "timestamp": timestamp,
                "duration": duration,
                "tier": tier,
                "componentType": component_type,
                "brief": brief,
                "srtContext": srt_context,
                "status": status,
                "previewUrl": preview_url,
                "finalAssetUrl": final_asset_url,
                "baseState": serde_json::from_str::<Value>(&base_state).unwrap_or(Value::Null),
                "animation": serde_json::from_str::<Value>(&animation).unwrap_or(Value::Null),
                "styleVariant": style_variant,
            }))
        },
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("plan_item:{item_id}")),
        other => other.into(),
    })
}
