use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::db::{DbState, ensure_exists};
use crate::error::{AppError, AppResult};
use crate::paths::{self, AppPaths};
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

#[tauri::command]
pub fn get_api_key(provider: String) -> AppResult<Option<String>> {
    secrets::get(&provider)
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

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
