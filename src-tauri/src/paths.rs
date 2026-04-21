use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
    pub db_path: String,
    pub projects_dir: String,
    pub config_dir: String,
}

pub fn config_dir(handle: &AppHandle) -> AppResult<PathBuf> {
    handle
        .path()
        .app_config_dir()
        .map_err(|e| AppError::Other(format!("resolve config dir: {e}")))
}

pub fn db_path(handle: &AppHandle) -> AppResult<PathBuf> {
    Ok(config_dir(handle)?.join("db.sqlite"))
}

pub fn projects_dir(handle: &AppHandle) -> AppResult<PathBuf> {
    // ~/Movies/WG Motion Studio on macOS — approximated via video_dir().
    let base = handle
        .path()
        .video_dir()
        .map_err(|e| AppError::Other(format!("resolve video dir: {e}")))?;
    Ok(base.join("WG Motion Studio"))
}

pub fn collect(handle: &AppHandle) -> AppResult<AppPaths> {
    Ok(AppPaths {
        db_path: db_path(handle)?.to_string_lossy().to_string(),
        projects_dir: projects_dir(handle)?.to_string_lossy().to_string(),
        config_dir: config_dir(handle)?.to_string_lossy().to_string(),
    })
}
