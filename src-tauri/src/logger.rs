use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

static LOG_PATH: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

pub fn init(handle: &AppHandle) -> AppResult<()> {
    let dir = handle
        .path()
        .app_log_dir()
        .map_err(|e| AppError::Other(format!("resolve log dir: {e}")))?;
    fs::create_dir_all(&dir)?;
    let path = dir.join("app.log");
    let _ = OpenOptions::new().create(true).append(true).open(&path);
    let slot = LOG_PATH.get_or_init(|| Mutex::new(None));
    *slot.lock().unwrap() = Some(path);
    log(Level::Info, "logger", "app started");
    Ok(())
}

pub fn path() -> Option<PathBuf> {
    LOG_PATH
        .get()
        .and_then(|m| m.lock().ok())
        .and_then(|g| g.clone())
}

pub fn clear() -> AppResult<()> {
    if let Some(p) = path() {
        fs::write(&p, b"").map_err(|e| AppError::Other(format!("clear log: {e}")))?;
    }
    Ok(())
}

#[derive(Copy, Clone)]
pub enum Level {
    Info,
    Warn,
    Error,
}

impl Level {
    fn tag(self) -> &'static str {
        match self {
            Level::Info => "INFO",
            Level::Warn => "WARN",
            Level::Error => "ERROR",
        }
    }
}

pub fn log(level: Level, target: &str, message: &str) {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let line = format!("{} [{}] {}: {}\n", ts, level.tag(), target, message);
    // Also echo to stderr for dev visibility.
    eprint!("{}", line);
    if let Some(p) = path() {
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&p) {
            let _ = f.write_all(line.as_bytes());
        }
    }
}
