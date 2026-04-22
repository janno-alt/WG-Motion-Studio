use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;

use crate::error::{AppError, AppResult};

const MODEL: &str = "gemini-3.1-flash-image-preview";
const API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta/models";

#[allow(dead_code)]
#[derive(Debug, Default, Deserialize)]
pub struct GeminiUsage {
    #[serde(default, rename = "promptTokenCount")]
    pub prompt_tokens: u32,
    #[serde(default, rename = "candidatesTokenCount")]
    pub output_tokens: u32,
}

#[allow(dead_code)]
pub struct ImageResponse {
    pub png_bytes: Vec<u8>,
    pub mime_type: String,
    pub usage: GeminiUsage,
    pub model: String,
}

#[derive(Debug, Deserialize)]
struct RawResponse {
    candidates: Vec<Candidate>,
    #[serde(default, rename = "usageMetadata")]
    usage: GeminiUsage,
}

#[derive(Debug, Deserialize)]
struct Candidate {
    content: CandidateContent,
}

#[derive(Debug, Deserialize)]
struct CandidateContent {
    parts: Vec<Part>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Part {
    #[serde(default)]
    inline_data: Option<InlineData>,
    #[serde(default)]
    #[allow(dead_code)]
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InlineData {
    mime_type: String,
    data: String,
}

/// Reference image for multimodal Gemini input. Bytes come from disk; we
/// base64-encode here so callers don't have to.
pub struct ReferenceImage<'a> {
    pub mime_type: &'a str,
    pub bytes: &'a [u8],
}

pub async fn request_image(
    api_key: &str,
    prompt: &str,
    refs: &[ReferenceImage<'_>],
) -> AppResult<ImageResponse> {
    let mut parts = Vec::with_capacity(1 + refs.len());
    parts.push(json!({ "text": prompt }));
    for r in refs {
        parts.push(json!({
            "inline_data": {
                "mime_type": r.mime_type,
                "data": BASE64.encode(r.bytes),
            }
        }));
    }

    let body = json!({
        "contents": [{ "role": "user", "parts": parts }],
        "generationConfig": { "responseModalities": ["IMAGE"] }
    });

    let url = format!("{API_BASE}/{MODEL}:generateContent?key={api_key}");

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| AppError::Other(format!("reqwest build: {e}")))?;

    let http = client
        .post(&url)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Other(format!("gemini request: {e}")))?;

    let status = http.status();
    let headers = http.headers().clone();
    let text = http
        .text()
        .await
        .map_err(|e| AppError::Other(format!("read body: {e}")))?;

    if status.as_u16() == 429 {
        let retry_after = headers
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(30);
        return Err(AppError::Other(format!("RATE_LIMIT:{retry_after}")));
    }
    if !status.is_success() {
        return Err(AppError::Other(format!("Gemini API {status}: {text}")));
    }

    let parsed: RawResponse =
        serde_json::from_str(&text).map_err(|e| AppError::Other(format!("parse response: {e}")))?;

    let (mime_type, encoded) = parsed
        .candidates
        .into_iter()
        .flat_map(|c| c.content.parts.into_iter())
        .find_map(|p| p.inline_data.map(|d| (d.mime_type, d.data)))
        .ok_or_else(|| AppError::Other("Gemini response contained no image".into()))?;

    let bytes = BASE64
        .decode(encoded.as_bytes())
        .map_err(|e| AppError::Other(format!("decode base64: {e}")))?;

    // Minimal content-sniff: PNG files start with 89 50 4E 47 0D 0A 1A 0A.
    if bytes.len() < 8 || &bytes[0..8] != b"\x89PNG\r\n\x1a\n" {
        // Not a PNG — we still accept JPEG since Gemini may return either, but
        // warn by returning the reported mime_type so callers can persist with
        // the right extension.
        if !mime_type.starts_with("image/") {
            return Err(AppError::Other(format!("unexpected mime type {mime_type}")));
        }
    }

    Ok(ImageResponse {
        png_bytes: bytes,
        mime_type,
        usage: parsed.usage,
        model: MODEL.to_string(),
    })
}
