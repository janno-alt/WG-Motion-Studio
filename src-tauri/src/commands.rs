use std::path::PathBuf;

use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::db::{DbState, ensure_exists};
use crate::error::{AppError, AppResult};
use crate::export;
use crate::fs_ops;
use crate::logger;
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
    pub created_at: i64,
    pub updated_at: i64,
}

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
    fn into_project(self) -> AppResult<Project> {
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
            created_at: self.created_at,
            updated_at: self.updated_at,
        })
    }
}

fn row_from_query(row: &rusqlite::Row) -> rusqlite::Result<ProjectRow> {
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
}

#[tauri::command]
pub fn list_projects(db: State<'_, DbState>) -> AppResult<Vec<Project>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, name, client_id, srt_path, video_path, video_format, video_duration,
                fps, settings, status, created_at, updated_at
           FROM projects ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], row_from_query)?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?.into_project()?);
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
            row_from_query,
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("project:{project_id}")),
            other => other.into(),
        })?;
    r.into_project()
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
/*  BrandKits (renamed from `themes` in migration 004)                 */
/* ------------------------------------------------------------------ */

#[tauri::command]
pub fn list_brand_kits(db: State<'_, DbState>) -> AppResult<Vec<Value>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT data, client_name, logo_path FROM brand_kits ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    })?;
    let mut out = Vec::new();
    for r in rows {
        let (data, client_name, logo_path) = r?;
        let mut value: Value = serde_json::from_str(&data)?;
        if let Some(obj) = value.as_object_mut() {
            if obj.get("clientName").is_none() {
                obj.insert(
                    "clientName".into(),
                    client_name.map(Value::String).unwrap_or(Value::Null),
                );
            }
            if obj.get("logoPath").is_none() {
                obj.insert(
                    "logoPath".into(),
                    logo_path.map(Value::String).unwrap_or(Value::Null),
                );
            }
        }
        out.push(value);
    }
    Ok(out)
}

#[tauri::command]
pub fn get_brand_kit(db: State<'_, DbState>, brand_kit_id: String) -> AppResult<Value> {
    let conn = db.conn.lock().unwrap();
    let (data, client_name, logo_path): (String, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT data, client_name, logo_path FROM brand_kits WHERE id = ?1",
            params![brand_kit_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound(format!("brand_kit:{brand_kit_id}"))
            }
            other => other.into(),
        })?;
    let mut value: Value = serde_json::from_str(&data)?;
    if let Some(obj) = value.as_object_mut() {
        if obj.get("clientName").is_none() {
            obj.insert(
                "clientName".into(),
                client_name.map(Value::String).unwrap_or(Value::Null),
            );
        }
        if obj.get("logoPath").is_none() {
            obj.insert(
                "logoPath".into(),
                logo_path.map(Value::String).unwrap_or(Value::Null),
            );
        }
    }
    Ok(value)
}

#[tauri::command]
pub fn save_brand_kit(db: State<'_, DbState>, brand_kit: Value) -> AppResult<Value> {
    let id = brand_kit
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Other("brand_kit.id missing".into()))?
        .to_string();
    let name = brand_kit
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let client_name = brand_kit
        .get("clientName")
        .and_then(|v| v.as_str())
        .map(String::from);
    let logo_path = brand_kit
        .get("logoPath")
        .and_then(|v| v.as_str())
        .map(String::from);
    let now = now_ms();
    let data = serde_json::to_string(&brand_kit)?;
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO brand_kits (id, name, data, client_name, logo_path, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name,
                                       data = excluded.data,
                                       client_name = excluded.client_name,
                                       logo_path = excluded.logo_path,
                                       updated_at = excluded.updated_at",
        params![id, name, data, client_name, logo_path, now],
    )?;
    Ok(brand_kit)
}

#[tauri::command]
pub fn delete_brand_kit(db: State<'_, DbState>, brand_kit_id: String) -> AppResult<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute("DELETE FROM brand_kits WHERE id = ?1", params![brand_kit_id])?;
    Ok(())
}

/* ------------------------------------------------------------------ */
/*  Secrets                                                            */
/* ------------------------------------------------------------------ */

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
pub fn save_brand_kit_logo(
    app: AppHandle,
    brand_kit_id: String,
    source_path: String,
) -> AppResult<String> {
    let p = fs_ops::save_brand_kit_asset(&app, &brand_kit_id, &PathBuf::from(&source_path), "logo")?;
    Ok(p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn save_brand_kit_reference(
    app: AppHandle,
    brand_kit_id: String,
    source_path: String,
) -> AppResult<String> {
    let p = fs_ops::save_brand_kit_asset(&app, &brand_kit_id, &PathBuf::from(&source_path), "ref")?;
    Ok(p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_brand_kit_asset(path: String) -> AppResult<()> {
    fs_ops::delete_brand_kit_asset(&PathBuf::from(path))
}

#[tauri::command]
pub fn read_file_as_string(path: String) -> AppResult<String> {
    fs_ops::read_string(&PathBuf::from(path))
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> AppResult<()> {
    let _ = std::process::Command::new("open").arg("-R").arg(&path).spawn();
    Ok(())
}

/* ------------------------------------------------------------------ */
/*  Export (kept; FCPXML/zip extended in Wave 5)                       */
/* ------------------------------------------------------------------ */

#[tauri::command]
pub fn write_project_export(
    app: AppHandle,
    project_id: String,
    filename: String,
    contents: String,
) -> AppResult<String> {
    let p = export::write_export(&app, &project_id, &filename, &contents)?;
    Ok(p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn zip_project_exports(
    app: AppHandle,
    project_id: String,
    project_name: String,
) -> AppResult<String> {
    let p = export::zip_project(&app, &project_id, &project_name)?;
    Ok(p.to_string_lossy().to_string())
}

/* ------------------------------------------------------------------ */
/*  Logging                                                            */
/* ------------------------------------------------------------------ */

#[tauri::command]
pub fn get_log_path() -> AppResult<Option<String>> {
    Ok(logger::path().map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn clear_logs() -> AppResult<()> {
    logger::clear()
}

#[tauri::command]
pub fn log_from_frontend(level: String, target: String, message: String) -> AppResult<()> {
    let l = match level.as_str() {
        "warn" => logger::Level::Warn,
        "error" => logger::Level::Error,
        _ => logger::Level::Info,
    };
    logger::log(l, &target, &message);
    Ok(())
}

/* ------------------------------------------------------------------ */
/*  API usage (Gemini-only after Wave 0; Pexels/Pixabay added Wave 3)  */
/* ------------------------------------------------------------------ */

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub total_cost_usd: f64,
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
        gemini_cost_usd: 0.0,
        since: since_ms,
    };
    for row in rows {
        let (provider, cost) = row?;
        if provider == "gemini" {
            summary.gemini_cost_usd = cost;
        }
        summary.total_cost_usd += cost;
    }
    Ok(summary)
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
