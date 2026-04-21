use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

const APP_DIR_NAME: &str = "wg-motion-studio";
const PROJECTS_DIR_NAME: &str = "WG Motion Studio";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
    pub db_path: String,
    pub projects_dir: String,
    pub config_dir: String,
}

/// Local-data root.
///   macOS:   ~/Library/Application Support/wg-motion-studio
///   Linux:   ~/.local/share/wg-motion-studio
///   Windows: %LOCALAPPDATA%/wg-motion-studio
///
/// Bundle identifier is intentionally NOT used — we want a stable, human-readable path.
pub fn config_dir(handle: &AppHandle) -> AppResult<PathBuf> {
    let base = handle
        .path()
        .data_dir()
        .map_err(|e| AppError::Other(format!("resolve data dir: {e}")))?;
    Ok(base.join(APP_DIR_NAME))
}

pub fn db_path(handle: &AppHandle) -> AppResult<PathBuf> {
    Ok(config_dir(handle)?.join("db.sqlite"))
}

/// User-facing project outputs (generated assets, renders, exports).
pub fn projects_dir(handle: &AppHandle) -> AppResult<PathBuf> {
    let base = handle
        .path()
        .video_dir()
        .map_err(|e| AppError::Other(format!("resolve video dir: {e}")))?;
    Ok(base.join(PROJECTS_DIR_NAME))
}

pub fn collect(handle: &AppHandle) -> AppResult<AppPaths> {
    Ok(AppPaths {
        db_path: db_path(handle)?.to_string_lossy().to_string(),
        projects_dir: projects_dir(handle)?.to_string_lossy().to_string(),
        config_dir: config_dir(handle)?.to_string_lossy().to_string(),
    })
}
