use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use zip::write::FileOptions;
use zip::CompressionMethod;

use crate::error::{AppError, AppResult};
use crate::fs_ops;

/// Write arbitrary text (FCPXML, Python script, etc.) into the project's
/// `exports/` directory and return the absolute path.
pub fn write_export(handle: &tauri::AppHandle, project_id: &str, filename: &str, contents: &str) -> AppResult<PathBuf> {
    let dir = fs_ops::ensure_project_dir(handle, project_id)?.join("exports");
    fs::create_dir_all(&dir)?;
    let dest = dir.join(filename);
    fs::write(&dest, contents).map_err(|e| AppError::Other(format!("write export: {e}")))?;
    Ok(dest)
}

/// Zip up the project's `assets/`, `renders/overlays/` and any file in
/// `exports/` (FCPXML, Python script) into a single archive next to the
/// project dir. Returns the zip's absolute path.
pub fn zip_project(handle: &tauri::AppHandle, project_id: &str, project_name: &str) -> AppResult<PathBuf> {
    let project_dir = fs_ops::ensure_project_dir(handle, project_id)?;
    let safe_name = sanitize_filename(project_name);
    let zip_path = project_dir
        .parent()
        .unwrap_or(project_dir.as_path())
        .join(format!("{safe_name}.zip"));
    let file = fs::File::create(&zip_path)
        .map_err(|e| AppError::Other(format!("create zip: {e}")))?;

    let mut zip = zip::ZipWriter::new(file);
    let opts = FileOptions::<()>::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    for sub in ["assets", "renders/overlays", "exports"] {
        let root = project_dir.join(sub);
        if !root.exists() {
            continue;
        }
        add_dir_recursive(&mut zip, &root, &project_dir, &opts)?;
    }

    zip.finish()
        .map_err(|e| AppError::Other(format!("finish zip: {e}")))?;
    Ok(zip_path)
}

fn add_dir_recursive(
    zip: &mut zip::ZipWriter<fs::File>,
    dir: &Path,
    base: &Path,
    opts: &FileOptions<'_, ()>,
) -> AppResult<()> {
    for entry in fs::read_dir(dir).map_err(|e| AppError::Other(format!("read dir: {e}")))? {
        let entry = entry.map_err(|e| AppError::Other(format!("entry: {e}")))?;
        let path = entry.path();
        let rel = path
            .strip_prefix(base)
            .unwrap_or(&path)
            .to_string_lossy()
            .into_owned();
        if path.is_dir() {
            add_dir_recursive(zip, &path, base, opts)?;
        } else {
            zip.start_file(rel, *opts)
                .map_err(|e| AppError::Other(format!("zip entry: {e}")))?;
            let bytes = fs::read(&path).map_err(|e| AppError::Other(format!("read: {e}")))?;
            zip.write_all(&bytes)
                .map_err(|e| AppError::Other(format!("write zip: {e}")))?;
        }
    }
    Ok(())
}

fn sanitize_filename(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}
