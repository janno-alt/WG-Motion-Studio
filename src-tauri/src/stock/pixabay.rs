use serde::Deserialize;

use crate::error::{AppError, AppResult};
use super::StockClip;

const ENDPOINT: &str = "https://pixabay.com/api/videos/";

#[derive(Deserialize)]
struct Resp {
    hits: Vec<Hit>,
}

#[derive(Deserialize)]
struct Hit {
    id: u64,
    duration: Option<u32>,
    picture_id: String,
    videos: Variants,
}

#[derive(Deserialize)]
struct Variants {
    large: Option<Variant>,
    medium: Option<Variant>,
    small: Option<Variant>,
    tiny: Option<Variant>,
}

#[derive(Deserialize)]
struct Variant {
    url: String,
    width: u32,
    height: u32,
}

pub async fn search(api_key: &str, query: &str, per_page: u32) -> AppResult<Vec<StockClip>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::Other(format!("reqwest build: {e}")))?;

    let per_page = per_page.clamp(3, 50);
    let resp = client
        .get(ENDPOINT)
        .query(&[
            ("key", api_key),
            ("q", query),
            ("per_page", &per_page.to_string()),
            ("video_type", "film"),
        ])
        .send()
        .await
        .map_err(|e| AppError::Other(format!("pixabay request: {e}")))?;

    if !resp.status().is_success() {
        let s = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Other(format!("pixabay HTTP {s}: {body}")));
    }

    let r: Resp = resp
        .json()
        .await
        .map_err(|e| AppError::Other(format!("pixabay JSON: {e}")))?;

    Ok(r.hits.into_iter().filter_map(|h| pick_best(&h, query)).collect())
}

fn pick_best(h: &Hit, query: &str) -> Option<StockClip> {
    // Pixabay's variants ordered roughly by quality. Prefer large if ≤ 1080p,
    // else medium, else small, else tiny.
    let pick = [&h.videos.large, &h.videos.medium, &h.videos.small, &h.videos.tiny]
        .into_iter()
        .find_map(|v| v.as_ref().filter(|v| v.height <= 1080))?;
    let thumb = format!("https://i.vimeocdn.com/video/{}_295x166.jpg", h.picture_id);
    Some(StockClip {
        source: "pixabay".into(),
        source_id: h.id.to_string(),
        query: query.to_string(),
        thumbnail_url: thumb,
        download_url: pick.url.clone(),
        width: pick.width,
        height: pick.height,
        duration_sec: h.duration.map(|d| d as f64),
    })
}
