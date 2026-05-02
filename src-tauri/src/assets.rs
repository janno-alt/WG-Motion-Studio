use std::path::{Path, PathBuf};

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_shell::ShellExt;

use crate::commands::now_ms;
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::fs_ops;
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

    // Generate a thumbnail for video / image assets. Failures are non-fatal.
    let thumbnail_path = generate_thumbnail(&app, &project_id, &id, &path, &probe).await.ok();

    let asset = Asset {
        id: id.clone(),
        project_id: project_id.clone(),
        kind: probe.kind.as_str().to_string(),
        name: name.clone(),
        path: source_path,
        thumbnail_path,
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
        upsert_fts(&conn, &asset.id, &asset.name, "")?;
    }

    Ok(asset)
}

async fn generate_thumbnail(
    app: &AppHandle,
    project_id: &str,
    asset_id: &str,
    src: &Path,
    probe: &media_probe::ProbeResult,
) -> AppResult<String> {
    let project_dir = fs_ops::ensure_project_dir(app, project_id)?;
    let thumbs_dir = project_dir.join(".thumbs");
    std::fs::create_dir_all(&thumbs_dir)?;
    let dest = thumbs_dir.join(format!("{asset_id}.jpg"));

    let dur = probe.duration_sec.unwrap_or(0.0);
    let seek = if dur > 0.0 { dur / 2.0 } else { 0.0 };
    let kind_str = probe.kind.as_str();

    let args: Vec<String> = if kind_str == "audio" {
        return Err(AppError::Other("audio has no thumbnail".into()));
    } else if kind_str == "image" {
        vec![
            "-y".into(),
            "-i".into(),
            src.to_string_lossy().to_string(),
            "-vf".into(),
            "scale='min(320,iw)':-2".into(),
            "-frames:v".into(),
            "1".into(),
            dest.to_string_lossy().to_string(),
        ]
    } else {
        vec![
            "-y".into(),
            "-ss".into(),
            format!("{seek}"),
            "-i".into(),
            src.to_string_lossy().to_string(),
            "-vf".into(),
            "scale='min(320,iw)':-2".into(),
            "-frames:v".into(),
            "1".into(),
            dest.to_string_lossy().to_string(),
        ]
    };

    let output = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| AppError::Other(format!("ffmpeg sidecar: {e}")))?
        .args(&args)
        .output()
        .await
        .map_err(|e| AppError::Other(format!("ffmpeg thumbnail: {e}")))?;
    if !output.status.success() {
        return Err(AppError::Other(format!(
            "ffmpeg thumbnail failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }
    Ok(dest.to_string_lossy().to_string())
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
    let rowid: Option<i64> = conn
        .query_row(
            "SELECT rowid FROM assets WHERE id = ?1",
            params![asset_id],
            |row| row.get(0),
        )
        .ok();
    conn.execute("DELETE FROM assets WHERE id = ?1", params![asset_id])?;
    if let Some(r) = rowid {
        conn.execute("DELETE FROM assets_fts WHERE rowid = ?1", params![r])?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_asset_tags(db: State<'_, DbState>, asset_id: String) -> AppResult<Vec<String>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT tag FROM asset_tags WHERE asset_id = ?1 ORDER BY tag")?;
    let rows = stmt.query_map(params![asset_id], |row| row.get::<_, String>(0))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

#[tauri::command]
pub fn set_asset_tags(
    db: State<'_, DbState>,
    asset_id: String,
    tags: Vec<String>,
) -> AppResult<Vec<String>> {
    let cleaned: Vec<String> = tags
        .into_iter()
        .map(|t| t.trim().to_lowercase())
        .filter(|t| !t.is_empty())
        .collect();
    let mut conn = db.conn.lock().unwrap();

    let asset_name: String = conn
        .query_row(
            "SELECT name FROM assets WHERE id = ?1",
            params![asset_id],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("asset:{asset_id}")),
            other => other.into(),
        })?;

    let tx = conn.transaction()?;
    tx.execute(
        "DELETE FROM asset_tags WHERE asset_id = ?1",
        params![asset_id],
    )?;
    for t in &cleaned {
        tx.execute(
            "INSERT OR IGNORE INTO asset_tags (asset_id, tag) VALUES (?1, ?2)",
            params![asset_id, t],
        )?;
    }
    tx.commit()?;

    let joined = cleaned.join(" ");
    upsert_fts(&conn, &asset_id, &asset_name, &joined)?;

    Ok(cleaned)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetSearchResult {
    pub asset: Asset,
    pub tags: Vec<String>,
}

#[tauri::command]
pub fn search_assets(
    db: State<'_, DbState>,
    project_id: String,
    query: String,
) -> AppResult<Vec<AssetSearchResult>> {
    let conn = db.conn.lock().unwrap();
    let trimmed = query.trim();

    let asset_ids: Vec<String> = if trimmed.is_empty() {
        let mut stmt = conn
            .prepare("SELECT id FROM assets WHERE project_id = ?1 ORDER BY imported_at DESC")?;
        let rows = stmt.query_map(params![project_id], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<_, _>>()?
    } else {
        // FTS5 prefix-match. Each whitespace-separated token gets a trailing
        // '*' for prefix search. Names + tag joins are checked too as a
        // fallback so substring searches inside identifiers still work.
        let match_expr = trimmed
            .split_whitespace()
            .map(|w| format!("\"{}\"*", w.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" ");
        let like = format!("%{}%", trimmed.to_lowercase());
        let mut stmt = conn.prepare(
            "SELECT a.id FROM assets a
              WHERE a.project_id = ?2
                AND (
                  a.rowid IN (SELECT rowid FROM assets_fts WHERE assets_fts MATCH ?1)
                  OR LOWER(a.name) LIKE ?3
                  OR EXISTS (
                    SELECT 1 FROM asset_tags t
                     WHERE t.asset_id = a.id AND t.tag LIKE ?3
                  )
                )
              ORDER BY a.imported_at DESC",
        )?;
        let rows = stmt.query_map(
            params![match_expr, project_id, like],
            |row| row.get::<_, String>(0),
        )?;
        rows.collect::<Result<_, _>>()?
    };

    let mut out = Vec::new();
    for id in asset_ids {
        let asset = conn.query_row(
            "SELECT id, project_id, kind, name, path, thumbnail_path, duration_sec, width, height,
                    fps, audio_channels, audio_sample_rate, size_bytes, imported_at
               FROM assets WHERE id = ?1",
            params![id],
            read_row,
        )?;
        let mut tag_stmt =
            conn.prepare("SELECT tag FROM asset_tags WHERE asset_id = ?1 ORDER BY tag")?;
        let tags: Vec<String> = tag_stmt
            .query_map(params![asset.id], |row| row.get::<_, String>(0))?
            .collect::<Result<_, _>>()?;
        out.push(AssetSearchResult { asset, tags });
    }
    Ok(out)
}

/// FTS5 in `content=''` mode: the virtual table stores its own copy keyed by
/// the rowid we provide. We use the `assets` table's rowid as the bridge so
/// search_assets can join back via `a.rowid IN (SELECT rowid FROM ...)`.
fn upsert_fts(conn: &Connection, asset_id: &str, name: &str, tags: &str) -> AppResult<()> {
    let rowid: i64 = conn.query_row(
        "SELECT rowid FROM assets WHERE id = ?1",
        params![asset_id],
        |row| row.get(0),
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO assets_fts (rowid, name, tags) VALUES (?1, ?2, ?3)",
        params![rowid, name, tags],
    )?;
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
