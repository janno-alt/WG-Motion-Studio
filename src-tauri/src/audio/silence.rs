use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_shell::ShellExt;

use crate::assets::Asset;
use crate::db::DbState;
use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SilenceRange {
    pub start_sec: f64,
    pub end_sec: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SilenceParams {
    pub threshold_db: f64,
    pub min_duration_sec: f64,
}

impl Default for SilenceParams {
    fn default() -> Self {
        Self {
            threshold_db: -30.0,
            min_duration_sec: 1.0,
        }
    }
}

#[tauri::command]
pub async fn detect_silence_in_asset(
    app: AppHandle,
    db: State<'_, DbState>,
    asset_id: String,
    params: Option<SilenceParams>,
) -> AppResult<Vec<SilenceRange>> {
    let path: String = {
        let conn = db.conn.lock().unwrap();
        conn.query_row(
            "SELECT path FROM assets WHERE id = ?1",
            rusqlite::params![asset_id],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("asset:{asset_id}")),
            other => other.into(),
        })?
    };
    detect_silence(&app, Path::new(&path), &params.unwrap_or_default()).await
}

pub async fn detect_silence(
    app: &AppHandle,
    source: &Path,
    params: &SilenceParams,
) -> AppResult<Vec<SilenceRange>> {
    let output = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| AppError::Other(format!("ffmpeg sidecar: {e}")))?
        .args([
            "-hide_banner",
            "-nostats",
            "-i",
            &source.to_string_lossy(),
            "-af",
            &format!(
                "silencedetect=noise={}dB:duration={}",
                params.threshold_db, params.min_duration_sec
            ),
            "-f",
            "null",
            "-",
        ])
        .output()
        .await
        .map_err(|e| AppError::Other(format!("ffmpeg silencedetect: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Other(format!("silencedetect failed: {stderr}")));
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    Ok(parse_silence_log(&stderr))
}

pub fn parse_silence_log(log: &str) -> Vec<SilenceRange> {
    let mut starts: Vec<f64> = Vec::new();
    let mut ranges: Vec<SilenceRange> = Vec::new();

    for line in log.lines() {
        if let Some(rest) = line.find("silence_start: ").map(|i| &line[i + "silence_start: ".len()..]) {
            if let Ok(t) = rest.split_whitespace().next().unwrap_or("").parse::<f64>() {
                starts.push(t);
            }
        } else if let Some(rest) = line.find("silence_end: ").map(|i| &line[i + "silence_end: ".len()..]) {
            if let Ok(t) = rest.split_whitespace().next().unwrap_or("").parse::<f64>() {
                if let Some(start) = starts.pop() {
                    ranges.push(SilenceRange {
                        start_sec: start,
                        end_sec: t,
                    });
                }
            }
        }
    }

    ranges
}

#[allow(dead_code)]
pub fn project_audio_assets(assets: &[Asset]) -> Vec<&Asset> {
    assets
        .iter()
        .filter(|a| a.kind == "audio" || a.kind == "video")
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_simple_silence_log() {
        let log = r#"
[silencedetect @ 0x7fa1b9000000] silence_start: 1.234
[silencedetect @ 0x7fa1b9000000] silence_end: 3.567 | silence_duration: 2.333
[silencedetect @ 0x7fa1b9000000] silence_start: 8.000
[silencedetect @ 0x7fa1b9000000] silence_end: 9.500 | silence_duration: 1.500
"#;
        let ranges = parse_silence_log(log);
        assert_eq!(ranges.len(), 2);
        assert!((ranges[0].start_sec - 1.234).abs() < 1e-6);
        assert!((ranges[0].end_sec - 3.567).abs() < 1e-6);
        assert!((ranges[1].start_sec - 8.0).abs() < 1e-6);
    }

    #[test]
    fn ignores_dangling_starts() {
        let log = "[silencedetect] silence_start: 1.0\n[silencedetect] silence_start: 2.0\n[silencedetect] silence_end: 3.0";
        let ranges = parse_silence_log(log);
        assert_eq!(ranges.len(), 1);
        assert!((ranges[0].start_sec - 2.0).abs() < 1e-6);
        assert!((ranges[0].end_sec - 3.0).abs() < 1e-6);
    }
}
