use serde::Deserialize;

use crate::error::{AppError, AppResult};
use super::StockClip;

const ENDPOINT: &str = "https://api.pexels.com/videos/search";

#[derive(Deserialize)]
struct Resp {
    videos: Vec<Video>,
}

#[derive(Deserialize)]
struct Video {
    id: u64,
    image: String,
    duration: Option<u32>,
    width: u32,
    height: u32,
    video_files: Vec<VideoFile>,
}

#[derive(Deserialize)]
struct VideoFile {
    link: String,
    width: Option<u32>,
    height: Option<u32>,
    quality: Option<String>,
}

pub async fn search(api_key: &str, query: &str, per_page: u32) -> AppResult<Vec<StockClip>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::Other(format!("reqwest build: {e}")))?;

    let resp = client
        .get(ENDPOINT)
        .header("Authorization", api_key)
        .query(&[
            ("query", query),
            ("per_page", &per_page.to_string()),
            ("orientation", "portrait"),
        ])
        .send()
        .await
        .map_err(|e| AppError::Other(format!("pexels request: {e}")))?;

    if !resp.status().is_success() {
        let s = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Other(format!("pexels HTTP {s}: {body}")));
    }

    let r: Resp = resp
        .json()
        .await
        .map_err(|e| AppError::Other(format!("pexels JSON: {e}")))?;

    Ok(r.videos
        .into_iter()
        .filter_map(|v| pick_best(&v, query))
        .collect())
}

fn pick_best(v: &Video, query: &str) -> Option<StockClip> {
    // Pick the highest-resolution file at or below 1080p — keeps download
    // size sane while staying high quality enough for vertical reels.
    let mut best: Option<&VideoFile> = None;
    let mut best_score: u32 = 0;
    for f in &v.video_files {
        let h = f.height.unwrap_or(0);
        if h > 1080 {
            continue;
        }
        let score = h;
        if score > best_score {
            best_score = score;
            best = Some(f);
        }
    }
    let file = best?;
    Some(StockClip {
        source: "pexels".into(),
        source_id: v.id.to_string(),
        query: query.to_string(),
        thumbnail_url: v.image.clone(),
        download_url: file.link.clone(),
        width: file.width.unwrap_or(v.width),
        height: file.height.unwrap_or(v.height),
        duration_sec: v.duration.map(|d| d as f64),
    })
    .map(|mut c| {
        // Tag with quality if available.
        if let Some(q) = &file.quality {
            c.source_id = format!("{}-{}", c.source_id, q);
        }
        c
    })
}
