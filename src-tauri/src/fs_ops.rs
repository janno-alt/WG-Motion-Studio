use std::fs;
use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::paths;

/// Absolute path to a project's working directory
/// (`~/Movies/WG Motion Studio/{project_id}`).
pub fn project_dir(handle: &AppHandle, project_id: &str) -> AppResult<PathBuf> {
    Ok(paths::projects_dir(handle)?.join(project_id))
}

pub fn ensure_project_dir(handle: &AppHandle, project_id: &str) -> AppResult<PathBuf> {
    let dir = project_dir(handle, project_id)?;
    fs::create_dir_all(dir.join("assets"))?;
    fs::create_dir_all(dir.join("renders/overlays"))?;
    fs::create_dir_all(dir.join("renders/full"))?;
    fs::create_dir_all(dir.join("exports"))?;
    Ok(dir)
}

pub fn project_srt_path(handle: &AppHandle, project_id: &str) -> AppResult<PathBuf> {
    Ok(project_dir(handle, project_id)?.join("source.srt"))
}

/// Copies an SRT file into the project's working directory as `source.srt`.
pub fn copy_srt_into_project(
    handle: &AppHandle,
    project_id: &str,
    source_srt: &Path,
) -> AppResult<PathBuf> {
    ensure_project_dir(handle, project_id)?;
    let dest = project_srt_path(handle, project_id)?;
    fs::copy(source_srt, &dest)?;
    Ok(dest)
}

pub fn read_srt(handle: &AppHandle, project_id: &str) -> AppResult<String> {
    let p = project_srt_path(handle, project_id)?;
    fs::read_to_string(&p)
        .map_err(|e| AppError::Other(format!("read srt {}: {e}", p.display())))
}

pub fn read_string(path: &Path) -> AppResult<String> {
    fs::read_to_string(path)
        .map_err(|e| AppError::Other(format!("read {}: {e}", path.display())))
}
