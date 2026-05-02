use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::ipc::Channel;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tokio::io::AsyncWriteExt;

use crate::error::{AppError, AppResult};
use crate::ipc::{DownloadProgress, WhisperProgress};
use crate::paths;

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WhisperModel {
    Medium,
    LargeV3,
}

impl WhisperModel {
    fn filename(&self) -> &'static str {
        match self {
            Self::Medium => "ggml-medium.bin",
            Self::LargeV3 => "ggml-large-v3.bin",
        }
    }

    fn url(&self) -> &'static str {
        match self {
            Self::Medium => "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
            Self::LargeV3 => "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin",
        }
    }

    pub fn approx_size_bytes(&self) -> u64 {
        match self {
            Self::Medium => 1_530_000_000,
            Self::LargeV3 => 3_100_000_000,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WhisperModelStatus {
    pub model: WhisperModel,
    pub installed: bool,
    pub path: String,
    pub size_bytes: u64,
}

#[tauri::command]
pub fn whisper_model_status(app: AppHandle, model: WhisperModel) -> AppResult<WhisperModelStatus> {
    let dir = paths::models_dir(&app)?;
    let path = dir.join(model.filename());
    let installed = path.exists();
    let size_bytes = if installed {
        std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };
    Ok(WhisperModelStatus {
        model,
        installed,
        path: path.to_string_lossy().to_string(),
        size_bytes,
    })
}

#[tauri::command]
pub async fn whisper_download_model(
    app: AppHandle,
    model: WhisperModel,
    progress: Channel<DownloadProgress>,
) -> AppResult<String> {
    let dir = paths::models_dir(&app)?;
    std::fs::create_dir_all(&dir)?;
    let dest = dir.join(model.filename());
    let tmp = dir.join(format!("{}.partial", model.filename()));

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| AppError::Other(format!("reqwest client: {e}")))?;
    let resp = client
        .get(model.url())
        .send()
        .await
        .map_err(|e| AppError::Other(format!("whisper model download: {e}")))?;

    if !resp.status().is_success() {
        let msg = format!("download HTTP {}", resp.status());
        let _ = progress.send(DownloadProgress::Error { message: msg.clone() });
        return Err(AppError::Other(msg));
    }

    let total = resp.content_length();
    let _ = progress.send(DownloadProgress::Started { total });

    let mut file = tokio::fs::File::create(&tmp)
        .await
        .map_err(|e| AppError::Other(format!("create model file: {e}")))?;

    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();
    let mut last_emit: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| AppError::Other(format!("stream chunk: {e}")))?;
        file.write_all(&bytes)
            .await
            .map_err(|e| AppError::Other(format!("write chunk: {e}")))?;
        downloaded += bytes.len() as u64;
        if downloaded - last_emit > 1_048_576 {
            let _ = progress.send(DownloadProgress::Progress { downloaded, total });
            last_emit = downloaded;
        }
    }
    file.flush()
        .await
        .map_err(|e| AppError::Other(format!("flush: {e}")))?;
    drop(file);

    tokio::fs::rename(&tmp, &dest)
        .await
        .map_err(|e| AppError::Other(format!("rename partial: {e}")))?;

    let dest_str = dest.to_string_lossy().to_string();
    let _ = progress.send(DownloadProgress::Done { path: dest_str.clone() });
    Ok(dest_str)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaptionSegment {
    pub start_sec: f64,
    pub end_sec: f64,
    pub text: String,
}

#[tauri::command]
pub async fn whisper_transcribe(
    app: AppHandle,
    source_path: String,
    model: WhisperModel,
    language: Option<String>,
    progress: Channel<WhisperProgress>,
) -> AppResult<Vec<CaptionSegment>> {
    let model_path = paths::models_dir(&app)?.join(model.filename());
    if !model_path.exists() {
        let msg = format!("Whisper model {} not installed", model.filename());
        let _ = progress.send(WhisperProgress::Error { message: msg.clone() });
        return Err(AppError::Other(msg));
    }

    let _ = progress.send(WhisperProgress::Extracting);
    let wav_path = extract_wav(&app, Path::new(&source_path)).await?;

    let _ = progress.send(WhisperProgress::Transcribing { percent: None });
    let json_text = run_whisper(&app, &wav_path, &model_path, language.as_deref()).await?;

    let _ = progress.send(WhisperProgress::Parsing);
    let segments = parse_whisper_json(&json_text)?;

    let _ = tokio::fs::remove_file(&wav_path).await;

    let _ = progress.send(WhisperProgress::Done {
        segments: segments.len() as u64,
    });
    Ok(segments)
}

async fn extract_wav(app: &AppHandle, source: &Path) -> AppResult<PathBuf> {
    let dir = std::env::temp_dir();
    let stem = source
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("audio");
    let id = nanoid::nanoid!(8);
    let dest = dir.join(format!("{stem}-{id}.wav"));

    let cmd = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| AppError::Other(format!("ffmpeg sidecar: {e}")))?
        .args([
            "-y",
            "-i",
            &source.to_string_lossy(),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-acodec",
            "pcm_s16le",
            &dest.to_string_lossy(),
        ]);

    let output = cmd
        .output()
        .await
        .map_err(|e| AppError::Other(format!("ffmpeg WAV extract: {e}")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Other(format!("ffmpeg WAV failed: {stderr}")));
    }
    Ok(dest)
}

async fn run_whisper(
    app: &AppHandle,
    wav_path: &Path,
    model_path: &Path,
    language: Option<&str>,
) -> AppResult<String> {
    let json_path = wav_path.with_extension("wav.json");

    let mut args: Vec<String> = vec![
        "-m".into(),
        model_path.to_string_lossy().to_string(),
        "-f".into(),
        wav_path.to_string_lossy().to_string(),
        "-oj".into(),
        "-of".into(),
        wav_path.to_string_lossy().to_string(),
    ];
    if let Some(lang) = language {
        args.push("-l".into());
        args.push(lang.to_string());
    }

    let cmd = app
        .shell()
        .sidecar("whisper")
        .map_err(|e| AppError::Other(format!("whisper sidecar: {e}")))?
        .args(&args);

    let (mut rx, _child) = cmd
        .spawn()
        .map_err(|e| AppError::Other(format!("whisper spawn: {e}")))?;

    let mut stderr_log = String::new();
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stderr(line) => {
                stderr_log.push_str(&String::from_utf8_lossy(&line));
            }
            CommandEvent::Terminated(payload) => {
                if !matches!(payload.code, Some(0)) {
                    return Err(AppError::Other(format!(
                        "whisper exited {:?}: {stderr_log}",
                        payload.code
                    )));
                }
                break;
            }
            _ => {}
        }
    }

    let json_text = tokio::fs::read_to_string(&json_path)
        .await
        .map_err(|e| AppError::Other(format!("read whisper json: {e}")))?;
    let _ = tokio::fs::remove_file(&json_path).await;
    Ok(json_text)
}

fn parse_whisper_json(text: &str) -> AppResult<Vec<CaptionSegment>> {
    #[derive(Deserialize)]
    struct Root {
        transcription: Vec<Segment>,
    }
    #[derive(Deserialize)]
    struct Segment {
        offsets: Offsets,
        text: String,
    }
    #[derive(Deserialize)]
    struct Offsets {
        from: i64,
        to: i64,
    }

    let root: Root = serde_json::from_str(text)
        .map_err(|e| AppError::Other(format!("whisper JSON parse: {e}")))?;
    Ok(root
        .transcription
        .into_iter()
        .map(|s| CaptionSegment {
            start_sec: s.offsets.from as f64 / 1000.0,
            end_sec: s.offsets.to as f64 / 1000.0,
            text: s.text.trim().to_string(),
        })
        .filter(|s| !s.text.is_empty() && s.end_sec > s.start_sec)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_whisper_json() {
        let raw = r#"
        {
          "systeminfo": "...",
          "model": {},
          "params": {},
          "result": {},
          "transcription": [
            { "timestamps": { "from": "00:00:00,000", "to": "00:00:01,200" },
              "offsets": { "from": 0, "to": 1200 },
              "text": " Hello." },
            { "timestamps": { "from": "00:00:01,200", "to": "00:00:03,500" },
              "offsets": { "from": 1200, "to": 3500 },
              "text": " World" },
            { "timestamps": { "from": "00:00:03,500", "to": "00:00:03,500" },
              "offsets": { "from": 3500, "to": 3500 },
              "text": " " }
          ]
        }
        "#;
        let segs = parse_whisper_json(raw).expect("parse");
        assert_eq!(segs.len(), 2);
        assert_eq!(segs[0].text, "Hello.");
        assert!((segs[0].start_sec - 0.0).abs() < 1e-9);
        assert!((segs[0].end_sec - 1.2).abs() < 1e-9);
        assert_eq!(segs[1].text, "World");
    }
}
