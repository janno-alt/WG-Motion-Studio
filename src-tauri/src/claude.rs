use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::error::{AppError, AppResult};

const API_URL: &str = "https://api.anthropic.com/v1/messages";
const API_VERSION: &str = "2023-06-01";
const MODEL: &str = "claude-opus-4-7";
const MAX_TOKENS: u32 = 16_000;
const TOOL_NAME: &str = "submit_motion_plan";

#[derive(Debug, Deserialize)]
pub struct ClaudeUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

#[derive(Debug)]
pub struct PlanResponse {
    pub items: Vec<Value>,
    pub usage: ClaudeUsage,
    pub model: String,
}

#[derive(Debug, Deserialize)]
struct RawResponse {
    model: String,
    content: Vec<ContentBlock>,
    usage: ClaudeUsage,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ContentBlock {
    #[serde(rename = "text")]
    Text {
        #[allow(dead_code)]
        text: String,
    },
    ToolUse {
        name: String,
        input: Value,
    },
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Serialize)]
pub struct PlanRequest<'a> {
    pub system_prompt: &'a str,
    pub user_prompt: &'a str,
    pub tool_schema: Value,
}

pub async fn request_plan(api_key: &str, req: &PlanRequest<'_>) -> AppResult<PlanResponse> {
    let body = json!({
        "model": MODEL,
        "max_tokens": MAX_TOKENS,
        "system": req.system_prompt,
        "messages": [{ "role": "user", "content": req.user_prompt }],
        "tools": [{
            "name": TOOL_NAME,
            "description": "Submit the final motion graphics plan for this video.",
            "input_schema": req.tool_schema,
        }],
        "tool_choice": { "type": "tool", "name": TOOL_NAME },
    });

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| AppError::Other(format!("reqwest build: {e}")))?;

    let http = client
        .post(API_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", API_VERSION)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Other(format!("anthropic request: {e}")))?;

    let status = http.status();
    let text = http
        .text()
        .await
        .map_err(|e| AppError::Other(format!("read body: {e}")))?;

    if !status.is_success() {
        return Err(AppError::Other(format!(
            "Anthropic API {status}: {text}"
        )));
    }

    let parsed: RawResponse =
        serde_json::from_str(&text).map_err(|e| AppError::Other(format!("parse response: {e}")))?;

    let items = parsed
        .content
        .into_iter()
        .find_map(|b| match b {
            ContentBlock::ToolUse { name, input } if name == TOOL_NAME => Some(input),
            _ => None,
        })
        .and_then(|v| v.get("items").cloned())
        .and_then(|v| v.as_array().cloned())
        .ok_or_else(|| AppError::Other("Claude response missing tool_use.items".into()))?;

    Ok(PlanResponse {
        items,
        usage: parsed.usage,
        model: parsed.model,
    })
}
