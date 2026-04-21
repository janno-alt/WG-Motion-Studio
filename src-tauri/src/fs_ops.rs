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

/// Theme reference-image directory: stable across projects, in app config dir.
pub fn theme_refs_dir(handle: &AppHandle, theme_id: &str) -> AppResult<PathBuf> {
    let dir = paths::config_dir(handle)?.join("themes").join(theme_id);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn save_theme_reference(
    handle: &AppHandle,
    theme_id: &str,
    source: &Path,
) -> AppResult<PathBuf> {
    let dir = theme_refs_dir(handle, theme_id)?;
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_string();
    // next free number
    let mut n = 1;
    loop {
        let candidate = dir.join(format!("ref-{n}.{ext}"));
        if !candidate.exists() {
            fs::copy(source, &candidate)?;
            return Ok(candidate);
        }
        n += 1;
        if n > 9999 {
            return Err(AppError::Other("too many reference images".into()));
        }
    }
}

pub fn delete_theme_reference(path: &Path) -> AppResult<()> {
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}
