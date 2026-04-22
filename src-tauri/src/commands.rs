use std::path::PathBuf;

use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, State};

use crate::assets::{self, GenerateAllSummary};
use crate::claude::{self, PlanRequest};
use crate::db::{DbState, ensure_exists};
use crate::error::{AppError, AppResult};
use crate::fs_ops;
use crate::paths::{self, AppPaths};
use crate::render;
use crate::secrets;

/* ------------------------------------------------------------------ */
/*  Paths                                                              */
/* ------------------------------------------------------------------ */

#[tauri::command]
pub fn get_app_paths(app: AppHandle) -> AppResult<AppPaths> {
    paths::collect(&app)
}

/* ------------------------------------------------------------------ */
/*  Projects                                                           */
/* ------------------------------------------------------------------ */

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub client_id: String,
    pub srt_path: String,
    #[serde(default)]
    pub video_path: Option<String>,
    pub video_format: String,
    pub video_duration: f64,
    pub fps: i64,
    pub settings: Value,
    pub status: String,
    #[serde(default)]
    pub plan_items: Vec<Value>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[tauri::command]
pub fn list_projects(db: State<'_, DbState>) -> AppResult<Vec<Project>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, name, client_id, srt_path, video_path, video_format, video_duration,
                fps, settings, status, created_at, updated_at
           FROM projects ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ProjectRow {
            id: row.get(0)?,
            name: row.get(1)?,
            client_id: row.get(2)?,
            srt_path: row.get(3)?,
            video_path: row.get(4)?,
            video_format: row.get(5)?,
            video_duration: row.get(6)?,
            fps: row.get(7)?,
            settings: row.get::<_, String>(8)?,
            status: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    })?;

    let mut out = Vec::new();
    for row in rows {
        let r = row?;
        let items = load_plan_items(&conn, &r.id)?;
        out.push(r.into_project(items)?);
    }
    Ok(out)
}

#[tauri::command]
pub fn get_project(db: State<'_, DbState>, project_id: String) -> AppResult<Project> {
    let conn = db.conn.lock().unwrap();
    let r: ProjectRow = conn
        .query_row(
            "SELECT id, name, client_id, srt_path, video_path, video_format, video_duration,
                    fps, settings, status, created_at, updated_at
               FROM projects WHERE id = ?1",
            params![project_id],
            |row| {
                Ok(ProjectRow {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    client_id: row.get(2)?,
                    srt_path: row.get(3)?,
                    video_path: row.get(4)?,
                    video_format: row.get(5)?,
                    video_duration: row.get(6)?,
                    fps: row.get(7)?,
                    settings: row.get::<_, String>(8)?,
                    status: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("project:{project_id}")),
            other => other.into(),
        })?;
    let items = load_plan_items(&conn, &r.id)?;
    r.into_project(items)
}

#[tauri::command]
pub fn create_project(db: State<'_, DbState>, project: Project) -> AppResult<Project> {
    {
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, client_id, srt_path, video_path, video_format,
                                   video_duration, fps, settings, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                project.id,
                project.name,
                project.client_id,
                project.srt_path,
                project.video_path,
                project.video_format,
                project.video_duration,
                project.fps,
                serde_json::to_string(&project.settings)?,
                project.status,
                project.created_at,
                project.updated_at,
            ],
        )?;
        write_plan_items(&conn, &project.id, &project.plan_items)?;
    }
    get_project(db, project.id)
}

#[tauri::command]
pub fn update_project(db: State<'_, DbState>, project: Project) -> AppResult<Project> {
    {
        let conn = db.conn.lock().unwrap();
        ensure_exists(&conn, "projects", &project.id)?;
        conn.execute(
            "UPDATE projects SET name = ?2, client_id = ?3, srt_path = ?4, video_path = ?5,
                                  video_format = ?6, video_duration = ?7, fps = ?8,
                                  settings = ?9, status = ?10, updated_at = ?11
             WHERE id = ?1",
            params![
                project.id,
                project.name,
                project.client_id,
                project.srt_path,
                project.video_path,
                project.video_format,
                project.video_duration,
                project.fps,
                serde_json::to_string(&project.settings)?,
                project.status,
                project.updated_at,
            ],
        )?;
        conn.execute("DELETE FROM plan_items WHERE project_id = ?1", params![project.id])?;
        write_plan_items(&conn, &project.id, &project.plan_items)?;
    }
    get_project(db, project.id)
}

#[tauri::command]
pub fn delete_project(db: State<'_, DbState>, project_id: String) -> AppResult<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute("DELETE FROM projects WHERE id = ?1", params![project_id])?;
    Ok(())
}

/* ------------------------------------------------------------------ */
/*  Themes                                                             */
/* ------------------------------------------------------------------ */

#[tauri::command]
pub fn list_themes(db: State<'_, DbState>) -> AppResult<Vec<Value>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT data FROM themes ORDER BY updated_at DESC")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    let mut out = Vec::new();
    for s in rows {
        out.push(serde_json::from_str::<Value>(&s?)?);
    }
    Ok(out)
}

#[tauri::command]
pub fn get_theme(db: State<'_, DbState>, theme_id: String) -> AppResult<Value> {
    let conn = db.conn.lock().unwrap();
    let s: String = conn
        .query_row(
            "SELECT data FROM themes WHERE id = ?1",
            params![theme_id],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("theme:{theme_id}")),
            other => other.into(),
        })?;
    Ok(serde_json::from_str(&s)?)
}

#[tauri::command]
pub fn save_theme(db: State<'_, DbState>, theme: Value) -> AppResult<Value> {
    let id = theme.get("id").and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Other("theme.id missing".into()))?
        .to_string();
    let name = theme.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let now = now_ms();
    let data = serde_json::to_string(&theme)?;
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO themes (id, name, data, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name,
                                       data = excluded.data,
                                       updated_at = excluded.updated_at",
        params![id, name, data, now],
    )?;
    Ok(theme)
}

#[tauri::command]
pub fn delete_theme(db: State<'_, DbState>, theme_id: String) -> AppResult<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute("DELETE FROM themes WHERE id = ?1", params![theme_id])?;
    Ok(())
}

/* ------------------------------------------------------------------ */
/*  Presets                                                            */
/* ------------------------------------------------------------------ */

#[tauri::command]
pub fn list_presets(db: State<'_, DbState>) -> AppResult<Vec<Value>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT data FROM presets ORDER BY built_in DESC, name ASC")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    let mut out = Vec::new();
    for s in rows {
        out.push(serde_json::from_str::<Value>(&s?)?);
    }
    Ok(out)
}

#[tauri::command]
pub fn save_preset(db: State<'_, DbState>, preset: Value) -> AppResult<Value> {
    let id = preset.get("id").and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Other("preset.id missing".into()))?
        .to_string();
    let name = preset.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let category = preset.get("category").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let built_in = preset.get("builtIn").and_then(|v| v.as_bool()).unwrap_or(false) as i64;
    let now = now_ms();
    let data = serde_json::to_string(&preset)?;
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO presets (id, name, category, built_in, data, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name,
                                       category = excluded.category,
                                       built_in = excluded.built_in,
                                       data = excluded.data,
                                       updated_at = excluded.updated_at",
        params![id, name, category, built_in, data, now],
    )?;
    Ok(preset)
}

#[tauri::command]
pub fn delete_preset(db: State<'_, DbState>, preset_id: String) -> AppResult<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "DELETE FROM presets WHERE id = ?1 AND built_in = 0",
        params![preset_id],
    )?;
    Ok(())
}

/* ------------------------------------------------------------------ */
/*  Secrets                                                            */
/* ------------------------------------------------------------------ */

/// Intentionally only exposes presence, never the value. The key stays in Rust.
#[tauri::command]
pub fn has_api_key(provider: String) -> AppResult<bool> {
    Ok(secrets::get(&provider)?.is_some())
}

#[tauri::command]
pub fn set_api_key(provider: String, value: String) -> AppResult<()> {
    secrets::set(&provider, &value)
}

#[tauri::command]
pub fn clear_api_key(provider: String) -> AppResult<()> {
    secrets::clear(&provider)
}

/* ------------------------------------------------------------------ */
/*  Filesystem / project scaffolding                                   */
/* ------------------------------------------------------------------ */

#[tauri::command]
pub fn ensure_project_dir(app: AppHandle, project_id: String) -> AppResult<String> {
    let dir = fs_ops::ensure_project_dir(&app, &project_id)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn copy_srt_into_project(
    app: AppHandle,
    project_id: String,
    source_path: String,
) -> AppResult<String> {
    let dest = fs_ops::copy_srt_into_project(&app, &project_id, &PathBuf::from(&source_path))?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn save_theme_reference_image(
    app: AppHandle,
    theme_id: String,
    source_path: String,
) -> AppResult<String> {
    let p = fs_ops::save_theme_reference(&app, &theme_id, &PathBuf::from(&source_path))?;
    Ok(p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_theme_reference_image(path: String) -> AppResult<()> {
    fs_ops::delete_theme_reference(&PathBuf::from(path))
}

#[tauri::command]
pub fn read_file_as_string(path: String) -> AppResult<String> {
    fs_ops::read_string(&PathBuf::from(path))
}

/* ------------------------------------------------------------------ */
/*  Asset generation                                                   */
/* ------------------------------------------------------------------ */

#[tauri::command]
pub async fn generate_all_assets(
    app: AppHandle,
    project_id: String,
) -> AppResult<GenerateAllSummary> {
    assets::generate_all(app, project_id).await
}

#[tauri::command]
pub async fn generate_single_asset(app: AppHandle, item_id: String) -> AppResult<()> {
    assets::generate_single(app, item_id).await
}

/* ------------------------------------------------------------------ */
/*  Rendering                                                          */
/* ------------------------------------------------------------------ */

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderItemResult {
    pub output_path: String,
}

#[tauri::command]
pub async fn render_item_overlay(
    app: AppHandle,
    project_id: String,
    item_id: String,
    output_path: Option<String>,
    format: Option<String>, // "webm" | "prores"
) -> AppResult<RenderItemResult> {
    let fmt = format.as_deref().unwrap_or("webm");
    let out = render::render_single_item(&app, &project_id, &item_id, output_path.as_deref(), fmt).await?;
    Ok(RenderItemResult { output_path: out })
}

/* ------------------------------------------------------------------ */
/*  API usage                                                          */
/* ------------------------------------------------------------------ */

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub total_cost_usd: f64,
    pub anthropic_cost_usd: f64,
    pub gemini_cost_usd: f64,
    pub since: i64,
}

#[tauri::command]
pub fn get_usage_since(db: State<'_, DbState>, since_ms: i64) -> AppResult<UsageSummary> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT provider, COALESCE(SUM(cost_usd), 0)
           FROM api_usage
          WHERE created_at >= ?1
       GROUP BY provider",
    )?;
    let rows = stmt.query_map(params![since_ms], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })?;

    let mut summary = UsageSummary {
        total_cost_usd: 0.0,
        anthropic_cost_usd: 0.0,
        gemini_cost_usd: 0.0,
        since: since_ms,
    };
    for row in rows {
        let (provider, cost) = row?;
        match provider.as_str() {
            "anthropic" => summary.anthropic_cost_usd = cost,
            "gemini" => summary.gemini_cost_usd = cost,
            _ => {}
        }
        summary.total_cost_usd += cost;
    }
    Ok(summary)
}

fn log_usage(
    conn: &rusqlite::Connection,
    project_id: Option<&str>,
    provider: &str,
    model: &str,
    input_tokens: u32,
    output_tokens: u32,
    cost_usd: f64,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO api_usage (project_id, provider, model, input_tokens, output_tokens, cost_usd, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![project_id, provider, model, input_tokens as i64, output_tokens as i64, cost_usd, now_ms()],
    )?;
    Ok(())
}

/* ------------------------------------------------------------------ */
/*  Plan generation                                                    */
/* ------------------------------------------------------------------ */

const OPUS_INPUT_USD_PER_MTOK: f64 = 15.0;
const OPUS_OUTPUT_USD_PER_MTOK: f64 = 75.0;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlanProgress {
    pub stage: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratePlanResult {
    pub item_count: usize,
    pub dropped_count: usize,
    pub cost_usd: f64,
    pub project: Project,
}

#[tauri::command]
pub async fn generate_plan(
    app: AppHandle,
    db: State<'_, DbState>,
    project_id: String,
    planning_prompt: String,
) -> AppResult<GeneratePlanResult> {
    emit_progress(&app, "loading", "Loading project context…");

    let (project, theme_value, presets) = {
        let conn = db.conn.lock().unwrap();
        let proj = load_project_row(&conn, &project_id)?;
        let theme_str: String = conn
            .query_row(
                "SELECT data FROM themes WHERE id = ?1",
                params![proj.client_id],
                |row| row.get(0),
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    AppError::NotFound(format!("theme:{}", proj.client_id))
                }
                other => other.into(),
            })?;
        let theme_value: Value = serde_json::from_str(&theme_str)?;
        let presets = load_all_presets(&conn)?;
        (proj.into_project(Vec::new())?, theme_value, presets)
    };

    let srt_content = fs_ops::read_srt(&app, &project_id)?;

    let api_key = secrets::get("anthropic")?
        .ok_or_else(|| AppError::Other("Anthropic API key not set".into()))?;

    let user_prompt = build_user_prompt(&project, &theme_value, &presets, &srt_content);
    let valid_preset_ids: Vec<String> = presets
        .iter()
        .filter_map(|p| p.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();
    let tool_schema = plan_tool_schema(&valid_preset_ids);

    emit_progress(&app, "calling", "Calling Claude Opus…");

    let mut last_err: Option<AppError> = None;
    let mut response = None;
    for attempt in 0..2 {
        match claude::request_plan(
            &api_key,
            &PlanRequest {
                system_prompt: &planning_prompt,
                user_prompt: &user_prompt,
                tool_schema: tool_schema.clone(),
            },
        )
        .await
        {
            Ok(r) => {
                response = Some(r);
                break;
            }
            Err(err) => {
                last_err = Some(err);
                if attempt == 0 {
                    emit_progress(&app, "calling", "Retrying after transient error…");
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            }
        }
    }
    let plan = response.ok_or_else(|| {
        last_err.unwrap_or_else(|| AppError::Other("Claude call failed".into()))
    })?;

    emit_progress(&app, "parsing", "Validating plan items…");
    let preset_id_set: std::collections::HashSet<String> = valid_preset_ids.iter().cloned().collect();
    let (valid_items, dropped) =
        filter_valid_items(&plan.items, project.video_duration, &preset_id_set);

    let cost = (plan.usage.input_tokens as f64) / 1_000_000.0 * OPUS_INPUT_USD_PER_MTOK
        + (plan.usage.output_tokens as f64) / 1_000_000.0 * OPUS_OUTPUT_USD_PER_MTOK;

    emit_progress(&app, "persisting", "Saving plan to database…");
    {
        let conn = db.conn.lock().unwrap();
        log_usage(
            &conn,
            Some(&project_id),
            "anthropic",
            &plan.model,
            plan.usage.input_tokens,
            plan.usage.output_tokens,
            cost,
        )?;
        conn.execute(
            "DELETE FROM plan_items WHERE project_id = ?1",
            params![project_id],
        )?;
        write_plan_items(&conn, &project_id, &valid_items)?;
        conn.execute(
            "UPDATE projects SET status = 'review', updated_at = ?2 WHERE id = ?1",
            params![project_id, now_ms()],
        )?;
    }

    emit_progress(&app, "done", "Done");

    let updated = get_project(db, project_id)?;
    Ok(GeneratePlanResult {
        item_count: valid_items.len(),
        dropped_count: dropped,
        cost_usd: cost,
        project: updated,
    })
}

fn emit_progress(app: &AppHandle, stage: &str, message: &str) {
    let _ = app.emit(
        "plan:progress",
        PlanProgress {
            stage: stage.to_string(),
            message: message.to_string(),
        },
    );
}

fn load_all_presets(conn: &rusqlite::Connection) -> AppResult<Vec<Value>> {
    let mut stmt = conn.prepare("SELECT data FROM presets ORDER BY category ASC, name ASC")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    let mut out = Vec::new();
    for s in rows {
        out.push(serde_json::from_str::<Value>(&s?)?);
    }
    Ok(out)
}

fn build_user_prompt(
    project: &Project,
    theme: &Value,
    presets: &[Value],
    srt: &str,
) -> String {
    let settings_str = serde_json::to_string_pretty(&project.settings).unwrap_or_default();
    let theme_str = serde_json::to_string_pretty(theme).unwrap_or_default();
    let preferred = theme
        .get("preferredPresets")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>().join(", "))
        .unwrap_or_default();

    // Compact preset catalog: id · category · name · tags.
    let catalog: Vec<String> = presets
        .iter()
        .filter_map(|p| {
            let id = p.get("id").and_then(|v| v.as_str())?;
            let cat = p.get("category").and_then(|v| v.as_str()).unwrap_or("");
            let name = p.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let tags = p
                .get("tags")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|t| t.as_str()).collect::<Vec<_>>().join(","))
                .unwrap_or_default();
            Some(format!("- {id} · {cat} · {name} [{tags}]"))
        })
        .collect();

    format!(
        "Project: {name}\nFormat: {format} @ {fps}fps\nDuration: {dur:.3}s\n\n\
         Settings:\n{settings}\n\n\
         Theme:\n{theme}\n\n\
         PreferredPresets: {preferred}\n\n\
         PresetLibrary:\n{catalog}\n\n\
         SRT transcript:\n{srt}\n\n\
         Produce the plan via the submit_motion_plan tool.",
        name = project.name,
        format = project.video_format,
        fps = project.fps,
        dur = project.video_duration,
        settings = settings_str,
        theme = theme_str,
        preferred = if preferred.is_empty() { "(none)".into() } else { preferred },
        catalog = catalog.join("\n"),
        srt = srt.trim(),
    )
}

fn plan_tool_schema(preset_ids: &[String]) -> Value {
    let preset_id_schema = if preset_ids.is_empty() {
        json!({ "type": "string", "minLength": 1 })
    } else {
        json!({ "type": "string", "enum": preset_ids })
    };

    let preset_instance = json!({
        "type": "object",
        "required": ["presetId", "duration", "intensity"],
        "properties": {
            "presetId": preset_id_schema,
            "duration": { "type": "number", "minimum": 0.05, "maximum": 10.0 },
            "intensity": { "type": "number", "minimum": 0, "maximum": 100 },
            "direction": {
                "type": "string",
                "enum": [
                    "up", "upRight", "right", "downRight",
                    "down", "downLeft", "left", "upLeft"
                ]
            }
        }
    });

    let nullable_motion = json!({
        "oneOf": [preset_instance, { "type": "null" }]
    });
    let motion_list = json!({
        "type": "array",
        "maxItems": 3,
        "items": preset_instance
    });

    let animation = json!({
        "type": "object",
        "required": ["enter", "idle", "exit"],
        "properties": {
            "enter": {
                "type": "object",
                "required": ["motion", "mask"],
                "properties": {
                    "motion": nullable_motion,
                    "mask": { "type": "null" }
                }
            },
            "idle": {
                "type": "object",
                "required": ["motion", "mask"],
                "properties": {
                    "motion": motion_list,
                    "mask": { "type": "null" }
                }
            },
            "exit": {
                "type": "object",
                "required": ["motion", "mask"],
                "properties": {
                    "motion": nullable_motion,
                    "mask": { "type": "null" }
                }
            }
        }
    });

    json!({
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["id", "timestamp", "duration", "tier", "brief", "srtContext", "animation"],
                    "properties": {
                        "id": { "type": "string" },
                        "timestamp": { "type": "number", "minimum": 0 },
                        "duration": { "type": "number", "minimum": 0.1, "maximum": 10.0 },
                        "tier": { "type": "integer", "enum": [1, 2, 3] },
                        "componentType": {
                            "type": "string",
                            "enum": [
                                "IconPopIn", "HighlightCircle", "SlideInIllustration",
                                "TextCallout", "NumberEmphasis", "ProgressBar",
                                "LowerThird", "ArrowPointer"
                            ]
                        },
                        "brief": { "type": "string", "minLength": 1 },
                        "srtContext": { "type": "string" },
                        "animation": animation
                    }
                }
            }
        },
        "required": ["items"]
    })
}

fn filter_valid_items(
    raw: &[Value],
    video_duration: f64,
    preset_ids: &std::collections::HashSet<String>,
) -> (Vec<Value>, usize) {
    let mut out = Vec::new();
    let mut dropped = 0usize;
    for (idx, item) in raw.iter().enumerate() {
        let Some(mut obj) = item.as_object().cloned() else {
            dropped += 1;
            continue;
        };

        let timestamp = obj.get("timestamp").and_then(|v| v.as_f64());
        let duration = obj.get("duration").and_then(|v| v.as_f64());
        let tier = obj.get("tier").and_then(|v| v.as_i64());

        let (Some(ts), Some(dur), Some(tier_v)) = (timestamp, duration, tier) else {
            dropped += 1;
            continue;
        };
        if !(0.0..=video_duration).contains(&ts) {
            dropped += 1;
            continue;
        }
        if !(0.1..=10.0).contains(&dur) {
            dropped += 1;
            continue;
        }
        if !(1..=3).contains(&tier_v) {
            dropped += 1;
            continue;
        }
        if tier_v != 1 {
            obj.remove("componentType");
        }
        if !obj.contains_key("id") {
            obj.insert(
                "id".into(),
                Value::String(format!("item-{}-{}", idx, now_ms())),
            );
        }
        // Round timestamps to 3 decimals.
        obj.insert(
            "timestamp".into(),
            json!((ts * 1000.0).round() / 1000.0),
        );
        obj.insert("duration".into(), json!((dur * 1000.0).round() / 1000.0));
        obj.insert("status".into(), Value::String("proposed".into()));
        obj.entry("baseState".to_string()).or_insert_with(default_base_state);
        let incoming = obj.remove("animation");
        obj.insert(
            "animation".into(),
            sanitize_animation(incoming, preset_ids),
        );
        out.push(Value::Object(obj));
    }
    out.sort_by(|a, b| {
        let ta = a.get("timestamp").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let tb = b.get("timestamp").and_then(|v| v.as_f64()).unwrap_or(0.0);
        ta.partial_cmp(&tb).unwrap_or(std::cmp::Ordering::Equal)
    });
    (out, dropped)
}

fn default_base_state() -> Value {
    json!({
        "position": { "x": 540.0, "y": 960.0 },
        "rotation": 0.0,
        "scale": { "x": 1.0, "y": 1.0 },
        "opacity": 1.0,
        "anchorPoint": { "x": 0.5, "y": 0.5 }
    })
}

fn default_animation() -> Value {
    // Used as the bedrock default — Claude-provided animations get merged on
    // top by `sanitize_animation`. Built-in fade-in / fade-out give every
    // plan item sensible motion even when Claude omits the field.
    json!({
        "enter": {
            "motion": { "presetId": "fade-in", "duration": 0.4, "intensity": 100 },
            "mask": null
        },
        "idle":  { "motion": [], "mask": null },
        "exit": {
            "motion": { "presetId": "fade-out", "duration": 0.35, "intensity": 100 },
            "mask": null
        }
    })
}

/// Accept Claude's `animation` object (or absent/invalid) and normalize to the
/// shape the engine expects. Preset refs that don't exist in the catalog are
/// dropped; malformed channels fall back to the default animation.
fn sanitize_animation(
    incoming: Option<Value>,
    preset_ids: &std::collections::HashSet<String>,
) -> Value {
    let default = default_animation();
    let Some(obj) = incoming.and_then(|v| v.as_object().cloned()) else {
        return default;
    };

    let enter_motion = sanitize_instance(obj.get("enter").and_then(|e| e.get("motion")), preset_ids)
        .or_else(|| default["enter"]["motion"].as_object().cloned().map(Value::Object));
    let exit_motion = sanitize_instance(obj.get("exit").and_then(|e| e.get("motion")), preset_ids)
        .or_else(|| default["exit"]["motion"].as_object().cloned().map(Value::Object));

    let idle_motion: Vec<Value> = obj
        .get("idle")
        .and_then(|e| e.get("motion"))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .take(3)
                .filter_map(|v| sanitize_instance(Some(v), preset_ids))
                .collect()
        })
        .unwrap_or_default();

    json!({
        "enter": { "motion": enter_motion, "mask": null },
        "idle":  { "motion": idle_motion, "mask": null },
        "exit":  { "motion": exit_motion, "mask": null }
    })
}

fn sanitize_instance(
    v: Option<&Value>,
    preset_ids: &std::collections::HashSet<String>,
) -> Option<Value> {
    let obj = v?.as_object()?;
    let preset_id = obj.get("presetId").and_then(|v| v.as_str())?;
    if !preset_ids.contains(preset_id) {
        return None;
    }
    let duration = obj
        .get("duration")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.4)
        .clamp(0.05, 10.0);
    let intensity = obj
        .get("intensity")
        .and_then(|v| v.as_f64())
        .unwrap_or(100.0)
        .clamp(0.0, 100.0);
    let mut out = json!({
        "presetId": preset_id,
        "duration": duration,
        "intensity": intensity,
    });
    if let Some(dir) = obj.get("direction").and_then(|v| v.as_str()) {
        out["direction"] = Value::String(dir.to_string());
    }
    Some(out)
}

fn load_project_row(conn: &rusqlite::Connection, project_id: &str) -> AppResult<ProjectRow> {
    conn.query_row(
        "SELECT id, name, client_id, srt_path, video_path, video_format, video_duration,
                fps, settings, status, created_at, updated_at
           FROM projects WHERE id = ?1",
        params![project_id],
        |row| {
            Ok(ProjectRow {
                id: row.get(0)?,
                name: row.get(1)?,
                client_id: row.get(2)?,
                srt_path: row.get(3)?,
                video_path: row.get(4)?,
                video_format: row.get(5)?,
                video_duration: row.get(6)?,
                fps: row.get(7)?,
                settings: row.get::<_, String>(8)?,
                status: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        },
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("project:{project_id}")),
        other => other.into(),
    })
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

struct ProjectRow {
    id: String,
    name: String,
    client_id: String,
    srt_path: String,
    video_path: Option<String>,
    video_format: String,
    video_duration: f64,
    fps: i64,
    settings: String,
    status: String,
    created_at: i64,
    updated_at: i64,
}

impl ProjectRow {
    fn into_project(self, plan_items: Vec<Value>) -> AppResult<Project> {
        Ok(Project {
            id: self.id,
            name: self.name,
            client_id: self.client_id,
            srt_path: self.srt_path,
            video_path: self.video_path,
            video_format: self.video_format,
            video_duration: self.video_duration,
            fps: self.fps,
            settings: serde_json::from_str(&self.settings)?,
            status: self.status,
            plan_items,
            created_at: self.created_at,
            updated_at: self.updated_at,
        })
    }
}

fn load_plan_items(conn: &rusqlite::Connection, project_id: &str) -> AppResult<Vec<Value>> {
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
        Ok((
            id, timestamp, duration, tier, component_type, brief, srt_context, status,
            preview_url, final_asset_url, base_state, animation, style_variant,
        ))
    })?;

    let mut out = Vec::new();
    for r in rows {
        let (id, timestamp, duration, tier, component_type, brief, srt_context, status,
             preview_url, final_asset_url, base_state, animation, style_variant) = r?;
        let mut item = serde_json::json!({
            "id": id,
            "timestamp": timestamp,
            "duration": duration,
            "tier": tier,
            "brief": brief,
            "srtContext": srt_context,
            "status": status,
            "baseState": serde_json::from_str::<Value>(&base_state)?,
            "animation": serde_json::from_str::<Value>(&animation)?,
        });
        if let Some(v) = component_type { item["componentType"] = Value::String(v); }
        if let Some(v) = preview_url { item["previewUrl"] = Value::String(v); }
        if let Some(v) = final_asset_url { item["finalAssetUrl"] = Value::String(v); }
        if let Some(v) = style_variant { item["styleVariant"] = Value::String(v); }
        out.push(item);
    }
    Ok(out)
}

fn write_plan_items(
    conn: &rusqlite::Connection,
    project_id: &str,
    items: &[Value],
) -> AppResult<()> {
    let mut stmt = conn.prepare(
        "INSERT INTO plan_items (id, project_id, timestamp, duration, tier, component_type,
                                 brief, srt_context, status, preview_url, final_asset_url,
                                 base_state, animation, style_variant, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
    )?;
    for (idx, item) in items.iter().enumerate() {
        let id = item.get("id").and_then(|v| v.as_str())
            .ok_or_else(|| AppError::Other("planItem.id missing".into()))?;
        let timestamp = item.get("timestamp").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let duration = item.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let tier = item.get("tier").and_then(|v| v.as_i64()).unwrap_or(1);
        let component_type = item.get("componentType").and_then(|v| v.as_str()).map(String::from);
        let brief = item.get("brief").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let srt_context = item.get("srtContext").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let status = item.get("status").and_then(|v| v.as_str()).unwrap_or("proposed").to_string();
        let preview_url = item.get("previewUrl").and_then(|v| v.as_str()).map(String::from);
        let final_asset_url = item.get("finalAssetUrl").and_then(|v| v.as_str()).map(String::from);
        let base_state = serde_json::to_string(
            item.get("baseState").unwrap_or(&Value::Object(Default::default())),
        )?;
        let animation = serde_json::to_string(
            item.get("animation").unwrap_or(&Value::Object(Default::default())),
        )?;
        let style_variant = item.get("styleVariant").and_then(|v| v.as_str()).map(String::from);

        stmt.execute(params![
            id,
            project_id,
            timestamp,
            duration,
            tier,
            component_type,
            brief,
            srt_context,
            status,
            preview_url,
            final_asset_url,
            base_state,
            animation,
            style_variant,
            idx as i64,
        ])?;
    }
    Ok(())
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
