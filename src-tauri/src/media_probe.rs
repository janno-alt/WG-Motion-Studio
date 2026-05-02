use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub kind: AssetKind,
    pub duration_sec: Option<f64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f64>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub audio_channels: Option<u32>,
    pub audio_sample_rate: Option<u32>,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AssetKind {
    Video,
    Audio,
    Image,
    Unknown,
}

impl AssetKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Video => "video",
            Self::Audio => "audio",
            Self::Image => "image",
            Self::Unknown => "unknown",
        }
    }
}

/// Probe a media file via the bundled `ffprobe` sidecar. Returns codec, dims,
/// fps, duration, and stream info parsed from ffprobe's `-print_format json`.
pub async fn probe(app: &AppHandle, path: &Path) -> AppResult<ProbeResult> {
    let path_str = path.to_string_lossy().to_string();

    let size_bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);

    let output = app
        .shell()
        .sidecar("ffprobe")
        .map_err(|e| AppError::Other(format!("ffprobe sidecar not registered: {e}")))?
        .args([
            "-v", "error",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            &path_str,
        ])
        .output()
        .await
        .map_err(|e| AppError::Other(format!("ffprobe spawn failed: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Other(format!("ffprobe failed: {stderr}")));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let raw: ProbeRaw = serde_json::from_str(&stdout)
        .map_err(|e| AppError::Other(format!("ffprobe JSON parse: {e}")))?;

    Ok(parse(raw, size_bytes))
}

fn parse(raw: ProbeRaw, size_bytes: u64) -> ProbeResult {
    let video = raw.streams.iter().find(|s| s.codec_type.as_deref() == Some("video"));
    let audio = raw.streams.iter().find(|s| s.codec_type.as_deref() == Some("audio"));

    let kind = match (video, audio) {
        (Some(v), _) if is_image_codec(v.codec_name.as_deref()) => AssetKind::Image,
        (Some(_), _) => AssetKind::Video,
        (None, Some(_)) => AssetKind::Audio,
        _ => AssetKind::Unknown,
    };

    let duration_sec = raw
        .format
        .as_ref()
        .and_then(|f| f.duration.as_deref())
        .and_then(|s| s.parse::<f64>().ok());

    let width = video.and_then(|v| v.width);
    let height = video.and_then(|v| v.height);
    let fps = video.and_then(|v| parse_rational(v.r_frame_rate.as_deref()));
    let video_codec = video.and_then(|v| v.codec_name.clone());

    let audio_codec = audio.and_then(|a| a.codec_name.clone());
    let audio_channels = audio.and_then(|a| a.channels);
    let audio_sample_rate = audio.and_then(|a| a.sample_rate.as_deref()).and_then(|s| s.parse().ok());

    ProbeResult {
        kind,
        duration_sec,
        width,
        height,
        fps,
        video_codec,
        audio_codec,
        audio_channels,
        audio_sample_rate,
        size_bytes,
    }
}

fn is_image_codec(codec: Option<&str>) -> bool {
    matches!(codec, Some("mjpeg" | "png" | "gif" | "webp" | "bmp" | "tiff"))
}

fn parse_rational(s: Option<&str>) -> Option<f64> {
    let s = s?;
    let mut parts = s.split('/');
    let num: f64 = parts.next()?.parse().ok()?;
    let den: f64 = parts.next().and_then(|d| d.parse().ok()).unwrap_or(1.0);
    if den == 0.0 { None } else { Some(num / den) }
}

#[derive(Deserialize)]
struct ProbeRaw {
    #[serde(default)]
    streams: Vec<Stream>,
    format: Option<Format>,
}

#[derive(Deserialize)]
struct Stream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    r_frame_rate: Option<String>,
    channels: Option<u32>,
    sample_rate: Option<String>,
}

#[derive(Deserialize)]
struct Format {
    duration: Option<String>,
}
