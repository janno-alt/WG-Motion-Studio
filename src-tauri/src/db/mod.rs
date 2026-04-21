pub mod migrations;
pub mod seed;

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

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

/// Open + migrate the DB. If the file exists but is unreadable / corrupt,
/// it's moved aside with a timestamp and a fresh DB is created in its place.
pub fn open_or_recover(path: &Path) -> AppResult<Connection> {
    if path.exists() {
        match try_open(path) {
            Ok(conn) => return Ok(conn),
            Err(err) => {
                eprintln!(
                    "[db] existing database unreadable ({err}); backing up and creating fresh one"
                );
                backup_corrupted(path)?;
            }
        }
    }
    try_open(path)
}

fn try_open(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    // Integrity check — catches silently corrupted DBs.
    let ok: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if ok != "ok" {
        return Err(AppError::Other(format!("integrity check failed: {ok}")));
    }
    Ok(conn)
}

fn backup_corrupted(path: &Path) -> AppResult<()> {
    let ts = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup: PathBuf = path.with_extension(format!("corrupt-{ts}.sqlite"));
    std::fs::rename(path, &backup)?;
    eprintln!("[db] corrupted database moved to {}", backup.display());
    Ok(())
}

/// Ensures a row with `id` exists in `table`, returns NotFound otherwise.
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
