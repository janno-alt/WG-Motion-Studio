use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "stage")]
pub enum RenderProgress {
    Starting { render_id: String },
    Encoding {
        render_id: String,
        frame: u64,
        total_frames: Option<u64>,
        fps: Option<f64>,
    },
    Done { render_id: String, output_path: String },
    Error { render_id: String, message: String },
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "stage")]
pub enum WhisperProgress {
    Extracting,
    Transcribing { percent: Option<f64> },
    Parsing,
    Done { segments: u64 },
    Error { message: String },
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "stage")]
pub enum DownloadProgress {
    Started { total: Option<u64> },
    Progress { downloaded: u64, total: Option<u64> },
    Done { path: String },
    Error { message: String },
}
