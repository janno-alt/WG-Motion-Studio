pub mod pexels;
pub mod pixabay;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StockClip {
    /// "pexels" or "pixabay"
    pub source: String,
    pub source_id: String,
    pub query: String,
    pub thumbnail_url: String,
    /// Best download URL we picked from the per-resolution list.
    pub download_url: String,
    pub width: u32,
    pub height: u32,
    pub duration_sec: Option<f64>,
}
