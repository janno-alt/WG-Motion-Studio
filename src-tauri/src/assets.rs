use std::path::{Path, PathBuf};

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::commands::now_ms;
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::media_probe;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub project_id: String,
    pub kind: String,
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub thumbnail_path: Option<String>,
    #[serde(default)]
    pub duration_sec: Option<f64>,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
    #[serde(default)]
    pub fps: Option<f64>,
    #[serde(default)]
    pub audio_channels: Option<u32>,
    #[serde(default)]
    pub audio_sample_rate: Option<u32>,
    pub size_bytes: u64,
    pub imported_at: i64,
}

#[tauri::command]
pub async fn import_asset(
    app: AppHandle,
    db: State<'_, DbState>,
    project_id: String,
    source_path: String,
) -> AppResult<Asset> {
    let path = PathBuf::from(&source_path);
    if !path.exists() {
        return Err(AppError::NotFound(format!("file:{source_path}")));
    }

    let probe = media_probe::probe(&app, &path).await?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("untitled")
        .to_string();
    let id = format!("ast-{}", nanoid::nanoid!(10));
    let imported_at = now_ms();

    let asset = Asset {
        id: id.clone(),
        project_id: project_id.clone(),
        kind: probe.kind.as_str().to_string(),
        name,
        path: source_path,
        thumbnail_path: None,
        duration_sec: probe.duration_sec,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        audio_channels: probe.audio_channels,
        audio_sample_rate: probe.audio_sample_rate,
        size_bytes: probe.size_bytes,
        imported_at,
    };

    {
        let conn = db.conn.lock().unwrap();
        insert(&conn, &asset)?;
    }

    Ok(asset)
}

#[tauri::command]
pub fn list_assets(db: State<'_, DbState>, project_id: String) -> AppResult<Vec<Asset>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, project_id, kind, name, path, thumbnail_path, duration_sec, width, height,
                fps, audio_channels, audio_sample_rate, size_bytes, imported_at
           FROM assets WHERE project_id = ?1 ORDER BY imported_at DESC",
    )?;
    let rows = stmt.query_map(params![project_id], read_row)?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

#[tauri::command]
pub fn get_asset(db: State<'_, DbState>, asset_id: String) -> AppResult<Asset> {
    let conn = db.conn.lock().unwrap();
    conn.query_row(
        "SELECT id, project_id, kind, name, path, thumbnail_path, duration_sec, width, height,
                fps, audio_channels, audio_sample_rate, size_bytes, imported_at
           FROM assets WHERE id = ?1",
        params![asset_id],
        read_row,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("asset:{asset_id}")),
        other => other.into(),
    })
}

#[tauri::command]
pub fn delete_asset(db: State<'_, DbState>, asset_id: String) -> AppResult<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute("DELETE FROM assets WHERE id = ?1", params![asset_id])?;
    Ok(())
}

fn insert(conn: &Connection, a: &Asset) -> AppResult<()> {
    conn.execute(
        "INSERT INTO assets (id, project_id, kind, name, path, thumbnail_path, duration_sec, width,
                             height, fps, audio_channels, audio_sample_rate, size_bytes, imported_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            a.id, a.project_id, a.kind, a.name, a.path, a.thumbnail_path, a.duration_sec,
            a.width, a.height, a.fps, a.audio_channels, a.audio_sample_rate,
            a.size_bytes as i64, a.imported_at
        ],
    )?;
    Ok(())
}

fn read_row(row: &rusqlite::Row) -> rusqlite::Result<Asset> {
    Ok(Asset {
        id: row.get(0)?,
        project_id: row.get(1)?,
        kind: row.get(2)?,
        name: row.get(3)?,
        path: row.get(4)?,
        thumbnail_path: row.get(5)?,
        duration_sec: row.get(6)?,
        width: row.get(7)?,
        height: row.get(8)?,
        fps: row.get(9)?,
        audio_channels: row.get(10)?,
        audio_sample_rate: row.get(11)?,
        size_bytes: row.get::<_, i64>(12)? as u64,
        imported_at: row.get(13)?,
    })
}

#[allow(dead_code)]
pub fn project_assets_dir(project_dir: &Path) -> PathBuf {
    project_dir.join("assets")
}
