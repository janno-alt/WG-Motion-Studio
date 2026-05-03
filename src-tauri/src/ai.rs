use std::path::PathBuf;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, State};

use crate::commands::now_ms;
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::gemini::{self, ContentPart, GeminiResponse, MODEL_FLASH};
use crate::secrets;
use crate::stock::{self, StockClip};
use crate::web_extract;

/* ------------------------------------------------------------------ */
/*  Auto-Hook                                                          */
/* ------------------------------------------------------------------ */

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HookSuggestion {
    pub text: String,
    pub rationale: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoHookInput {
    pub project_id: String,
    pub captions_joined: String,
    pub voice_tone: Option<String>,
}

const AUTO_HOOK_SYSTEM: &str = "You are a short-form video copywriter.
Given the captions of a vertical social-media video, propose 3 alternative \
opening hooks that maximise watch-through. Each hook is 5-10 words, in the \
SAME LANGUAGE as the input captions, and must work as the very first line a \
viewer hears in the first second. Return strictly the JSON shape requested \
with no extra prose.";

#[tauri::command]
pub async fn auto_hook(
    db: State<'_, DbState>,
    input: AutoHookInput,
) -> AppResult<Vec<HookSuggestion>> {
    let api_key = secrets::get("gemini")?
        .ok_or_else(|| AppError::Other("Gemini API key not set".into()))?;

    let user_prompt = format!(
        "Voice tone: {}\n\nCurrent captions:\n{}\n\nReturn 3 alternative hooks.",
        input.voice_tone.as_deref().unwrap_or("(unspecified)"),
        input.captions_joined.trim()
    );

    let schema = json!({
        "type": "object",
        "properties": {
            "hooks": {
                "type": "array",
                "minItems": 3,
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "required": ["text", "rationale"],
                    "properties": {
                        "text": { "type": "string", "minLength": 1 },
                        "rationale": { "type": "string", "minLength": 1 }
                    }
                }
            }
        },
        "required": ["hooks"]
    });

    let resp = gemini::structured_generate(
        &api_key,
        MODEL_FLASH,
        AUTO_HOOK_SYSTEM,
        &user_prompt,
        schema,
    )
    .await?;

    log_usage(&db, Some(&input.project_id), &resp)?;

    let parsed: Value = serde_json::from_str(&resp.json_text)
        .map_err(|e| AppError::Other(format!("auto_hook JSON: {e}")))?;
    let hooks_value = parsed
        .get("hooks")
        .ok_or_else(|| AppError::Other("auto_hook missing 'hooks'".into()))?;
    let hooks: Vec<HookSuggestion> = serde_json::from_value(hooks_value.clone())
        .map_err(|e| AppError::Other(format!("auto_hook hook shape: {e}")))?;

    Ok(hooks)
}

/* ------------------------------------------------------------------ */
/*  Auto-B-Roll                                                        */
/* ------------------------------------------------------------------ */

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBRollInput {
    pub project_id: String,
    pub caption_text: String,
    pub source: String, // "pexels" | "pixabay" | "both"
}

const BROLL_SYSTEM: &str = "You are an editor picking B-roll for a vertical \
social-media video. Given a caption, produce 5 SHORT (1-3 word) stock-search \
queries in English that depict literal or strongly evocative visuals for the \
caption. Avoid abstract concepts; prefer concrete nouns + adjectives. Return \
strictly the JSON shape requested.";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BRollResult {
    pub query: String,
    pub clips: Vec<StockClip>,
}

#[tauri::command]
pub async fn auto_broll_search(
    db: State<'_, DbState>,
    input: AutoBRollInput,
) -> AppResult<Vec<BRollResult>> {
    let gemini_key = secrets::get("gemini")?
        .ok_or_else(|| AppError::Other("Gemini API key not set".into()))?;

    let user_prompt = format!(
        "Caption:\n{}\n\nReturn 5 stock search queries.",
        input.caption_text.trim()
    );
    let schema = json!({
        "type": "object",
        "properties": {
            "queries": {
                "type": "array",
                "minItems": 5,
                "maxItems": 5,
                "items": { "type": "string", "minLength": 1, "maxLength": 60 }
            }
        },
        "required": ["queries"]
    });

    let resp =
        gemini::structured_generate(&gemini_key, MODEL_FLASH, BROLL_SYSTEM, &user_prompt, schema)
            .await?;
    log_usage(&db, Some(&input.project_id), &resp)?;

    let parsed: Value = serde_json::from_str(&resp.json_text)
        .map_err(|e| AppError::Other(format!("auto_broll JSON: {e}")))?;
    let queries: Vec<String> = parsed
        .get("queries")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let mut out: Vec<BRollResult> = Vec::new();
    let pexels_key = secrets::get("pexels")?;
    let pixabay_key = secrets::get("pixabay")?;
    for q in queries {
        let mut clips: Vec<StockClip> = Vec::new();
        let want_pexels = (input.source == "pexels" || input.source == "both") && pexels_key.is_some();
        let want_pixabay = (input.source == "pixabay" || input.source == "both") && pixabay_key.is_some();
        if want_pexels {
            if let Ok(found) = stock::pexels::search(pexels_key.as_ref().unwrap(), &q, 3).await {
                clips.extend(found);
            }
        }
        if want_pixabay {
            if let Ok(found) = stock::pixabay::search(pixabay_key.as_ref().unwrap(), &q, 3).await {
                clips.extend(found);
            }
        }
        if clips.is_empty() {
            continue;
        }
        out.push(BRollResult { query: q, clips });
    }
    Ok(out)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadStockInput {
    pub project_id: String,
    pub clip: StockClip,
}

#[tauri::command]
pub async fn download_stock_clip(
    app: AppHandle,
    input: DownloadStockInput,
) -> AppResult<String> {
    let project_dir = crate::fs_ops::ensure_project_dir(&app, &input.project_id)?;
    let stock_dir = project_dir.join("stock");
    std::fs::create_dir_all(&stock_dir)?;
    let ext = guess_extension(&input.clip.download_url);
    let dest: PathBuf = stock_dir.join(format!(
        "{}-{}.{}",
        input.clip.source, input.clip.source_id, ext
    ));
    if dest.exists() {
        return Ok(dest.to_string_lossy().to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| AppError::Other(format!("reqwest build: {e}")))?;
    let resp = client
        .get(&input.clip.download_url)
        .send()
        .await
        .map_err(|e| AppError::Other(format!("stock download: {e}")))?;
    if !resp.status().is_success() {
        return Err(AppError::Other(format!("stock HTTP {}", resp.status())));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AppError::Other(format!("stock body: {e}")))?;
    std::fs::write(&dest, &bytes)?;
    Ok(dest.to_string_lossy().to_string())
}

fn guess_extension(url: &str) -> &'static str {
    let lower = url.to_lowercase();
    if lower.contains(".mp4") {
        "mp4"
    } else if lower.contains(".mov") {
        "mov"
    } else if lower.contains(".webm") {
        "webm"
    } else {
        "mp4"
    }
}

/* ------------------------------------------------------------------ */
/*  Vibe-Mode                                                          */
/* ------------------------------------------------------------------ */

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VibeModeInput {
    pub project_id: String,
    pub vibe: String,
    pub current_clip_count: u32,
    pub avg_clip_duration_sec: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VibeAdjustment {
    /// 0.5 → cut twice as often; 2.0 → half as many cuts.
    pub cut_frequency_multiplier: f64,
    /// "low" | "mid" | "high"
    pub music_energy: String,
    /// 0.0..2.0 — multiplier applied to music track volume.
    pub music_volume_multiplier: f64,
    /// "subtle" | "normal" | "vivid"
    pub color_saturation: String,
    pub rationale: String,
}

const VIBE_SYSTEM: &str = "You are a video editor mapping a verbal vibe to \
concrete editing parameters for a short-form social video. Given the user's \
freetext vibe and the current state of the timeline, return JSON with \
cutFrequencyMultiplier, musicEnergy, musicVolumeMultiplier, colorSaturation, \
and a 1-sentence rationale. Stick to the schema.";

#[tauri::command]
pub async fn vibe_mode(
    db: State<'_, DbState>,
    input: VibeModeInput,
) -> AppResult<VibeAdjustment> {
    let api_key = secrets::get("gemini")?
        .ok_or_else(|| AppError::Other("Gemini API key not set".into()))?;

    let user_prompt = format!(
        "Vibe: {}\nCurrent timeline: {} clips, avg {:.1}s each.\nReturn one adjustment.",
        input.vibe.trim(),
        input.current_clip_count,
        input.avg_clip_duration_sec
    );

    let schema = json!({
        "type": "object",
        "required": [
            "cutFrequencyMultiplier",
            "musicEnergy",
            "musicVolumeMultiplier",
            "colorSaturation",
            "rationale"
        ],
        "properties": {
            "cutFrequencyMultiplier": { "type": "number", "minimum": 0.25, "maximum": 4.0 },
            "musicEnergy": { "type": "string", "enum": ["low", "mid", "high"] },
            "musicVolumeMultiplier": { "type": "number", "minimum": 0.0, "maximum": 2.0 },
            "colorSaturation": { "type": "string", "enum": ["subtle", "normal", "vivid"] },
            "rationale": { "type": "string", "minLength": 1 }
        }
    });

    let resp =
        gemini::structured_generate(&api_key, MODEL_FLASH, VIBE_SYSTEM, &user_prompt, schema)
            .await?;
    log_usage(&db, Some(&input.project_id), &resp)?;

    let parsed: VibeAdjustment = serde_json::from_str(&resp.json_text)
        .map_err(|e| AppError::Other(format!("vibe_mode JSON: {e} — {}", resp.json_text)))?;
    Ok(parsed)
}

/* ------------------------------------------------------------------ */
/*  AI BrandKit Generator                                              */
/* ------------------------------------------------------------------ */

const BRAND_KIT_SYSTEM: &str = "You are a brand-design assistant helping a \
short-form video editor build a BrandKit. Given any combination of website \
metadata, page colours, favicon image, or uploaded marketing visuals, infer \
a coherent brand identity. Output strictly the JSON schema requested. \
Each field is optional — fill only what you have evidence for. Use hex \
colours like \"#A8E544\". Voice tone must be one of casual, professional, \
energetic, warm. The rationale field is REQUIRED — 1-2 sentences explaining \
your colour and font picks (or stating that confidence was low).";

fn brand_kit_response_schema() -> Value {
    json!({
        "type": "object",
        "required": ["rationale"],
        "properties": {
            "name": { "type": "string" },
            "clientName": { "type": "string" },
            "colors": {
                "type": "object",
                "properties": {
                    "primary": { "type": "string" },
                    "secondary": { "type": "string" },
                    "accent": { "type": "string" },
                    "background": { "type": "string" }
                }
            },
            "typography": {
                "type": "object",
                "properties": {
                    "headlineFont": { "type": "string" },
                    "bodyFont": { "type": "string" }
                }
            },
            "voiceProfile": {
                "type": "object",
                "properties": {
                    "tone": {
                        "type": "string",
                        "enum": ["casual", "professional", "energetic", "warm"]
                    },
                    "notes": { "type": "string" }
                }
            },
            "musicStyles": {
                "type": "array",
                "items": { "type": "string" }
            },
            "styleNotes": { "type": "string" },
            "rationale": { "type": "string", "minLength": 1 }
        }
    })
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiBrandKitFromUrlInput {
    pub url: String,
    #[serde(default)]
    pub instructions: Option<String>,
}

#[tauri::command]
pub async fn ai_brand_kit_from_url(
    db: State<'_, DbState>,
    input: AiBrandKitFromUrlInput,
) -> AppResult<Value> {
    let api_key = secrets::get("gemini")?
        .ok_or_else(|| AppError::Other("Gemini API key not set".into()))?;

    let signals = web_extract::extract_brand_signals(&input.url).await?;

    let mut user_text = String::new();
    user_text.push_str(&format!("URL: {}\n", signals.source_url));
    if let Some(t) = &signals.title {
        user_text.push_str(&format!("Title: {t}\n"));
    }
    if let Some(d) = &signals.description {
        user_text.push_str(&format!("Description: {d}\n"));
    }
    if let Some(s) = &signals.site_name {
        user_text.push_str(&format!("Site name: {s}\n"));
    }
    if let Some(c) = &signals.theme_color {
        user_text.push_str(&format!("Theme colour meta: {c}\n"));
    }
    if !signals.inline_colors.is_empty() {
        user_text.push_str(&format!(
            "Hex colours found in inline CSS: {}\n",
            signals.inline_colors.join(", ")
        ));
    }
    if let Some(extra) = &input.instructions {
        if !extra.trim().is_empty() {
            user_text.push_str(&format!("\nUser hints: {extra}\n"));
        }
    }
    user_text.push_str(
        "\nInfer the BrandKit. If the page is JS-heavy and you saw little, say so in rationale.",
    );

    let mut parts: Vec<ContentPart> = vec![ContentPart::Text(user_text)];
    if let (Some(b64), Some(mime)) = (signals.favicon_base64, signals.favicon_mime) {
        parts.push(ContentPart::InlineImage { mime_type: mime, base64_data: b64 });
    }

    let resp = gemini::structured_generate_with_parts(
        &api_key,
        MODEL_FLASH,
        BRAND_KIT_SYSTEM,
        parts,
        brand_kit_response_schema(),
    )
    .await?;
    log_usage(&db, None, &resp)?;

    let parsed: Value = serde_json::from_str(&resp.json_text)
        .map_err(|e| AppError::Other(format!("brand_kit JSON: {e} — {}", resp.json_text)))?;
    Ok(parsed)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiBrandKitFromImagesInput {
    pub paths: Vec<String>,
    #[serde(default)]
    pub instructions: Option<String>,
}

#[tauri::command]
pub async fn ai_brand_kit_from_images(
    db: State<'_, DbState>,
    input: AiBrandKitFromImagesInput,
) -> AppResult<Value> {
    let api_key = secrets::get("gemini")?
        .ok_or_else(|| AppError::Other("Gemini API key not set".into()))?;

    if input.paths.is_empty() {
        return Err(AppError::Other("No images provided".into()));
    }
    if input.paths.len() > 8 {
        return Err(AppError::Other("Max 8 images per generation".into()));
    }

    let mut parts: Vec<ContentPart> = Vec::new();
    let mut user_text = String::from(
        "I've attached one or more brand visuals (screenshots, marketing \
materials, social posts). Synthesise a BrandKit from them.",
    );
    if let Some(extra) = &input.instructions {
        if !extra.trim().is_empty() {
            user_text.push_str(&format!("\n\nUser hints: {extra}"));
        }
    }
    parts.push(ContentPart::Text(user_text));

    for path in &input.paths {
        let p = PathBuf::from(path);
        let bytes = std::fs::read(&p)
            .map_err(|e| AppError::Other(format!("read image {path}: {e}")))?;
        if bytes.len() > 6 * 1024 * 1024 {
            return Err(AppError::Other(format!(
                "image {path} is too large ({} MB) — max 6 MB",
                bytes.len() / 1_048_576
            )));
        }
        let mime = guess_image_mime(&p);
        parts.push(ContentPart::InlineImage {
            mime_type: mime,
            base64_data: BASE64.encode(&bytes),
        });
    }

    let resp = gemini::structured_generate_with_parts(
        &api_key,
        MODEL_FLASH,
        BRAND_KIT_SYSTEM,
        parts,
        brand_kit_response_schema(),
    )
    .await?;
    log_usage(&db, None, &resp)?;

    let parsed: Value = serde_json::from_str(&resp.json_text)
        .map_err(|e| AppError::Other(format!("brand_kit JSON: {e} — {}", resp.json_text)))?;
    Ok(parsed)
}

fn guess_image_mime(path: &std::path::Path) -> String {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "png" => "image/png".into(),
        "jpg" | "jpeg" => "image/jpeg".into(),
        "webp" => "image/webp".into(),
        "gif" => "image/gif".into(),
        "ico" => "image/x-icon".into(),
        _ => "application/octet-stream".into(),
    }
}

/* ------------------------------------------------------------------ */
/*  Usage logging                                                      */
/* ------------------------------------------------------------------ */

fn log_usage(
    db: &State<'_, DbState>,
    project_id: Option<&str>,
    resp: &GeminiResponse,
) -> AppResult<()> {
    let cost = gemini::cost_usd(&resp.model, &resp.usage);
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO api_usage (project_id, provider, model, input_tokens, output_tokens, cost_usd, created_at)
         VALUES (?1, 'gemini', ?2, ?3, ?4, ?5, ?6)",
        params![
            project_id,
            resp.model,
            resp.usage.prompt_tokens as i64,
            resp.usage.output_tokens as i64,
            cost,
            now_ms(),
        ],
    )?;
    Ok(())
}
