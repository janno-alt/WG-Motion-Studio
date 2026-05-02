use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::error::{AppError, AppResult};

const ENDPOINT_BASE: &str = "https://generativelanguage.googleapis.com/v1beta/models";

/// Pinned model IDs. Wave 3 uses Flash by default; Lite is cheaper for
/// high-volume calls (e.g. per-clip B-Roll suggestions in batch).
pub const MODEL_FLASH: &str = "gemini-2.5-flash-001";
#[allow(dead_code)]
pub const MODEL_FLASH_LITE: &str = "gemini-2.5-flash-lite-001";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GeminiUsage {
    pub prompt_tokens: u32,
    pub output_tokens: u32,
}

pub struct GeminiResponse {
    pub model: String,
    pub json_text: String,
    pub usage: GeminiUsage,
}

pub async fn structured_generate(
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    response_schema: Value,
) -> AppResult<GeminiResponse> {
    let url = format!("{ENDPOINT_BASE}/{model}:generateContent?key={api_key}");

    let body = json!({
        "systemInstruction": {
            "parts": [{ "text": system_prompt }]
        },
        "contents": [{
            "role": "user",
            "parts": [{ "text": user_prompt }]
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": response_schema,
            "temperature": 0.7,
            "candidateCount": 1
        }
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| AppError::Other(format!("reqwest build: {e}")))?;

    let mut last_err: Option<AppError> = None;
    for attempt in 0..3 {
        let resp = client.post(&url).json(&body).send().await;
        match resp {
            Ok(r) => {
                let status = r.status();
                let raw = r
                    .text()
                    .await
                    .map_err(|e| AppError::Other(format!("gemini body read: {e}")))?;
                if !status.is_success() {
                    last_err =
                        Some(AppError::Other(format!("gemini HTTP {status}: {raw}")));
                } else {
                    return parse_response(&raw, model);
                }
            }
            Err(e) => {
                last_err = Some(AppError::Other(format!("gemini request: {e}")));
            }
        }
        let backoff_ms = 250u64 * (1 << attempt);
        tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
    }
    Err(last_err.unwrap_or_else(|| AppError::Other("gemini exhausted retries".into())))
}

pub fn parse_response(raw: &str, model: &str) -> AppResult<GeminiResponse> {
    let v: Value = serde_json::from_str(raw)
        .map_err(|e| AppError::Other(format!("gemini JSON: {e} — {raw}")))?;
    let text = v
        .pointer("/candidates/0/content/parts/0/text")
        .and_then(|x| x.as_str())
        .ok_or_else(|| AppError::Other(format!("gemini missing text: {raw}")))?
        .to_string();
    let prompt_tokens = v
        .pointer("/usageMetadata/promptTokenCount")
        .and_then(|x| x.as_u64())
        .unwrap_or(0) as u32;
    let output_tokens = v
        .pointer("/usageMetadata/candidatesTokenCount")
        .and_then(|x| x.as_u64())
        .unwrap_or(0) as u32;
    Ok(GeminiResponse {
        model: model.to_string(),
        json_text: text,
        usage: GeminiUsage {
            prompt_tokens,
            output_tokens,
        },
    })
}

/// Pricing per 1M tokens for Flash (Jan 2026). Lite is roughly 1/3 of these.
pub fn cost_usd(model: &str, usage: &GeminiUsage) -> f64 {
    let (input_per_mtok, output_per_mtok): (f64, f64) = match model {
        m if m.starts_with("gemini-2.5-flash-lite") => (0.10, 0.40),
        m if m.starts_with("gemini-2.5-flash") => (0.30, 2.50),
        _ => (0.30, 2.50),
    };
    (usage.prompt_tokens as f64) / 1_000_000.0 * input_per_mtok
        + (usage.output_tokens as f64) / 1_000_000.0 * output_per_mtok
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_minimal_response() {
        let raw = r#"
        {
          "candidates": [
            { "content": { "parts": [{ "text": "{\"hooks\": []}" }] }, "finishReason": "STOP" }
          ],
          "usageMetadata": { "promptTokenCount": 100, "candidatesTokenCount": 30, "totalTokenCount": 130 }
        }
        "#;
        let r = parse_response(raw, MODEL_FLASH).expect("parse");
        assert_eq!(r.json_text, "{\"hooks\": []}");
        assert_eq!(r.usage.prompt_tokens, 100);
        assert_eq!(r.usage.output_tokens, 30);
    }

    #[test]
    fn cost_calculations() {
        // Flash: 10k input + 5k output = (10000/1e6)*0.30 + (5000/1e6)*2.50
        // = 0.003 + 0.0125 = 0.0155
        let c = cost_usd(MODEL_FLASH, &GeminiUsage { prompt_tokens: 10_000, output_tokens: 5_000 });
        assert!((c - 0.0155).abs() < 1e-6, "got {c}");

        // Flash-Lite: same tokens
        // = (10000/1e6)*0.10 + (5000/1e6)*0.40 = 0.001 + 0.002 = 0.003
        let c2 = cost_usd(MODEL_FLASH_LITE, &GeminiUsage { prompt_tokens: 10_000, output_tokens: 5_000 });
        assert!((c2 - 0.003).abs() < 1e-6, "got {c2}");
    }
}
