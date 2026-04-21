use std::path::Path;
use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension, params};

use crate::error::{AppError, AppResult};

pub struct DbState {
    pub conn: Mutex<Connection>,
}

impl DbState {
    pub fn new(conn: Connection) -> Self {
        Self { conn: Mutex::new(conn) }
    }
}

pub fn open(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(conn)
}

pub fn migrate(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          client_id TEXT NOT NULL,
          srt_path TEXT NOT NULL,
          video_path TEXT,
          video_format TEXT NOT NULL,
          video_duration REAL NOT NULL,
          fps INTEGER NOT NULL,
          settings TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS plan_items (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          timestamp REAL NOT NULL,
          duration REAL NOT NULL,
          tier INTEGER NOT NULL,
          component_type TEXT,
          brief TEXT NOT NULL,
          srt_context TEXT NOT NULL,
          status TEXT NOT NULL,
          preview_url TEXT,
          final_asset_url TEXT,
          base_state TEXT NOT NULL,
          animation TEXT NOT NULL,
          style_variant TEXT,
          sort_order INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS themes (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          data TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS presets (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          built_in INTEGER NOT NULL,
          data TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS api_usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          input_tokens INTEGER,
          output_tokens INTEGER,
          cost_usd REAL,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_plan_items_project ON plan_items(project_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_usage_project ON api_usage(project_id);
        CREATE INDEX IF NOT EXISTS idx_usage_date ON api_usage(created_at);
        "#,
    )?;
    Ok(())
}

pub fn ensure_exists(conn: &Connection, table: &str, id: &str) -> AppResult<()> {
    let sql = format!("SELECT id FROM {} WHERE id = ?1", table);
    let existing: Option<String> = conn
        .query_row(&sql, params![id], |row| row.get::<_, String>(0))
        .optional()?;
    if existing.is_none() {
        return Err(AppError::NotFound(format!("{}:{}", table, id)));
    }
    Ok(())
}
