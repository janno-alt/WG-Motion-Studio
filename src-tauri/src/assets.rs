use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::Arc;

use futures::stream::{FuturesUnordered, StreamExt};
use rusqlite::params;
use serde::Serialize;
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Semaphore;

use crate::claude;
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::fs_ops;
use crate::gemini;
use crate::secrets;
use crate::svg;

const OPUS_INPUT_USD_PER_MTOK: f64 = 15.0;
const OPUS_OUTPUT_USD_PER_MTOK: f64 = 75.0;
const NANO_BANANA_PER_IMAGE_USD: f64 = 0.039;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AssetProgress {
    pub item_id: String,
    pub phase: String,
    pub message: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateAllSummary {
    pub total: usize,
    pub succeeded: usize,
    pub skipped_cached: usize,
    pub failed: usize,
    pub cost_usd: f64,
}

/// Compute a stable cache key for a plan-item + theme combination.
/// Changes to brief / tier / componentType / theme invalidate the cache.
pub fn asset_hash(
    brief: &str,
    tier: i64,
    component_type: Option<&str>,
    theme_id: &str,
    theme_updated_at: i64,
) -> String {
    let mut h = DefaultHasher::new();
    brief.hash(&mut h);
    tier.hash(&mut h);
    component_type.unwrap_or("").hash(&mut h);
    theme_id.hash(&mut h);
    theme_updated_at.hash(&mut h);
    format!("{:016x}", h.finish())
}

/// Generate assets for every approved/proposed plan-item in a project.
pub async fn generate_all(app: AppHandle, project_id: String) -> AppResult<GenerateAllSummary> {
    let items = {
        let db: tauri::State<'_, DbState> = app.state();
        snapshot_items(&db, &project_id)?
    };
    let total = items.len();

    let sem = Arc::new(Semaphore::new(5));
    let mut futs = FuturesUnordered::new();
    for item in items {
        let permit = sem.clone();
        let app = app.clone();
        futs.push(async move {
            let _p = permit.acquire_owned().await.ok();
            let result = generate_one(app.clone(), item.clone()).await;
            (item, result)
        });
    }

    let mut succeeded = 0usize;
    let mut failed = 0usize;
    let mut cached = 0usize;
    let mut total_cost = 0.0f64;

    while let Some((item, result)) = futs.next().await {
        match result {
            Ok(outcome) => {
                total_cost += outcome.cost_usd;
                if outcome.cached {
                    cached += 1;
                } else {
                    succeeded += 1;
                }
                emit(
                    &app,
                    &item.id,
                    "done",
                    outcome.cached.then(|| "cached".to_string()),
                    None,
                );
            }
            Err(err) => {
                failed += 1;
                let msg = err.to_string();
                {
                    let db: tauri::State<'_, DbState> = app.state();
                    set_status(&db, &item.id, "error", None).ok();
                }
                emit(&app, &item.id, "error", None, Some(msg));
            }
        }
    }

    if succeeded + cached > 0 {
        let db: tauri::State<'_, DbState> = app.state();
        let now = crate::commands::now_ms();
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "UPDATE projects SET status = 'generated', updated_at = ?1 WHERE id = ?2",
            params![now, project_id],
        )?;
    }

    Ok(GenerateAllSummary {
        total,
        succeeded,
        skipped_cached: cached,
        failed,
        cost_usd: total_cost,
    })
}

/// Regenerate a single asset regardless of cache.
pub async fn generate_single(app: AppHandle, item_id: String) -> AppResult<()> {
    let item = {
        let db: tauri::State<'_, DbState> = app.state();
        let conn = db.conn.lock().unwrap();
        load_item_row(&conn, &item_id)?
    };
    {
        let db: tauri::State<'_, DbState> = app.state();
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "UPDATE plan_items SET asset_hash = NULL WHERE id = ?1",
            params![item_id],
        )?;
    }
    let outcome = generate_one(app.clone(), item.clone()).await?;
    emit(
        &app,
        &item.id,
        "done",
        outcome.cached.then(|| "cached".to_string()),
        None,
    );
    Ok(())
}

/* ------------------------------------------------------------------ */
/*  Per-item generation                                                */
/* ------------------------------------------------------------------ */

struct PlanItemRow {
    id: String,
    project_id: String,
    tier: i64,
    component_type: Option<String>,
    brief: String,
    srt_context: String,
    client_id: String,
    theme_data: String,
    theme_updated_at: i64,
    existing_hash: Option<String>,
    final_asset_url: Option<String>,
}

impl Clone for PlanItemRow {
    fn clone(&self) -> Self {
        Self {
            id: self.id.clone(),
            project_id: self.project_id.clone(),
            tier: self.tier,
            component_type: self.component_type.clone(),
            brief: self.brief.clone(),
            srt_context: self.srt_context.clone(),
            client_id: self.client_id.clone(),
            theme_data: self.theme_data.clone(),
            theme_updated_at: self.theme_updated_at,
            existing_hash: self.existing_hash.clone(),
            final_asset_url: self.final_asset_url.clone(),
        }
    }
}

struct GenerationOutcome {
    cached: bool,
    cost_usd: f64,
}

async fn generate_one(
    app: AppHandle,
    item: PlanItemRow,
) -> AppResult<GenerationOutcome> {
    let hash = asset_hash(
        &item.brief,
        item.tier,
        item.component_type.as_deref(),
        &item.client_id,
        item.theme_updated_at,
    );

    // Cache hit — existing asset still on disk and hash matches.
    if let (Some(existing), Some(url)) = (item.existing_hash.as_deref(), item.final_asset_url.as_deref()) {
        if existing == hash && std::path::Path::new(url).exists() {
            emit(&app, &item.id, "cached", Some("asset up to date".into()), None);
            return Ok(GenerationOutcome { cached: true, cost_usd: 0.0 });
        }
    }

    emit(&app, &item.id, "starting", None, None);

    // Tier 1 — nothing to fetch. Mark as generated (rendered on demand).
    if item.tier == 1 {
        return finalize(app, item, hash, None, "anthropic", 0.0, true);
    }

    let theme: Value = serde_json::from_str(&item.theme_data)?;

    if item.tier == 2 {
        let api_key = secrets::get("anthropic")?
            .ok_or_else(|| AppError::Other("Anthropic API key not set".into()))?;
        let (system_prompt, user_prompt) = build_svg_prompts(&item, &theme);

        emit(&app, &item.id, "calling", Some("Claude SVG".into()), None);
        let response = with_retries(3, || {
            let api_key = api_key.clone();
            let sys = system_prompt.clone();
            let usr = user_prompt.clone();
            async move { claude::request_svg(&api_key, &sys, &usr).await }
        })
        .await?;

        emit(&app, &item.id, "validating", None, None);
        let clean = svg::sanitize(&response.svg)?;

        emit(&app, &item.id, "saving", None, None);
        let dest = asset_path(&app, &item.project_id, &item.id, "svg")?;
        fs::write(&dest, clean.as_bytes())
            .map_err(|e| AppError::Other(format!("write svg: {e}")))?;

        let cost = (response.usage.input_tokens as f64) / 1_000_000.0 * OPUS_INPUT_USD_PER_MTOK
            + (response.usage.output_tokens as f64) / 1_000_000.0 * OPUS_OUTPUT_USD_PER_MTOK;

        return finalize(app, item, hash, Some(dest), "anthropic", cost, false);
    }

    // Tier 3 — Gemini image generation.
    if item.tier == 3 {
        let api_key = secrets::get("gemini")?
            .ok_or_else(|| AppError::Other("Gemini API key not set".into()))?;
        let prompt = build_image_prompt(&item, &theme);
        let reference_bytes: Vec<(String, Vec<u8>)> = collect_reference_images(&theme);
        let refs: Vec<gemini::ReferenceImage<'_>> = reference_bytes
            .iter()
            .map(|(mime, bytes)| gemini::ReferenceImage {
                mime_type: mime.as_str(),
                bytes: bytes.as_slice(),
            })
            .collect();

        emit(&app, &item.id, "calling", Some("Nano Banana".into()), None);
        let response = with_retries(3, || {
            let api_key = api_key.clone();
            let prompt = prompt.clone();
            let refs_data: Vec<(String, Vec<u8>)> = reference_bytes
                .iter()
                .map(|(m, b)| (m.clone(), b.clone()))
                .collect();
            async move {
                let refs: Vec<gemini::ReferenceImage<'_>> = refs_data
                    .iter()
                    .map(|(m, b)| gemini::ReferenceImage { mime_type: m.as_str(), bytes: b.as_slice() })
                    .collect();
                gemini::request_image(&api_key, &prompt, &refs).await
            }
        })
        .await?;
        void_refs(&refs);

        emit(&app, &item.id, "saving", None, None);
        let dest = asset_path(&app, &item.project_id, &item.id, "png")?;
        fs::write(&dest, &response.png_bytes)
            .map_err(|e| AppError::Other(format!("write image: {e}")))?;

        return finalize(app, item, hash, Some(dest), "gemini", NANO_BANANA_PER_IMAGE_USD, false);
    }

    Err(AppError::Other(format!("unknown tier {}", item.tier)))
}

fn void_refs(_: &[gemini::ReferenceImage<'_>]) {}

fn finalize(
    app: AppHandle,
    item: PlanItemRow,
    hash: String,
    dest: Option<PathBuf>,
    provider: &str,
    cost_usd: f64,
    is_tier1_marker: bool,
) -> AppResult<GenerationOutcome> {
    let app_state: tauri::State<'_, DbState> = app.state();
    let dest_str = dest.as_ref().map(|p| p.to_string_lossy().to_string());
    let conn = app_state.conn.lock().unwrap();
    let now = crate::commands::now_ms();
    conn.execute(
        "UPDATE plan_items
            SET status = 'generated',
                final_asset_url = ?2,
                asset_hash = ?3,
                generated_at = ?4
          WHERE id = ?1",
        params![item.id, dest_str, hash, now],
    )?;
    if cost_usd > 0.0 {
        conn.execute(
            "INSERT INTO api_usage (project_id, provider, model, input_tokens, output_tokens, cost_usd, created_at)
             VALUES (?1, ?2, ?3, NULL, NULL, ?4, ?5)",
            params![item.project_id, provider, "", cost_usd, now],
        )?;
    }
    drop(conn);
    void_tier1(is_tier1_marker);
    Ok(GenerationOutcome { cached: false, cost_usd })
}

fn void_tier1(_: bool) {}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

fn snapshot_items(db: &DbState, project_id: &str) -> AppResult<Vec<PlanItemRow>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT pi.id, pi.project_id, pi.tier, pi.component_type, pi.brief, pi.srt_context,
                p.client_id, t.data, t.updated_at, pi.asset_hash, pi.final_asset_url
           FROM plan_items pi
           JOIN projects p ON p.id = pi.project_id
           JOIN themes t ON t.id = p.client_id
          WHERE pi.project_id = ?1
            AND pi.status IN ('proposed', 'approved', 'error', 'generated')
          ORDER BY pi.sort_order ASC",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(PlanItemRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            tier: row.get(2)?,
            component_type: row.get(3)?,
            brief: row.get(4)?,
            srt_context: row.get(5)?,
            client_id: row.get(6)?,
            theme_data: row.get(7)?,
            theme_updated_at: row.get(8)?,
            existing_hash: row.get(9)?,
            final_asset_url: row.get(10)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

fn load_item_row(conn: &rusqlite::Connection, item_id: &str) -> AppResult<PlanItemRow> {
    conn.query_row(
        "SELECT pi.id, pi.project_id, pi.tier, pi.component_type, pi.brief, pi.srt_context,
                p.client_id, t.data, t.updated_at, pi.asset_hash, pi.final_asset_url
           FROM plan_items pi
           JOIN projects p ON p.id = pi.project_id
           JOIN themes t ON t.id = p.client_id
          WHERE pi.id = ?1",
        params![item_id],
        |row| {
            Ok(PlanItemRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                tier: row.get(2)?,
                component_type: row.get(3)?,
                brief: row.get(4)?,
                srt_context: row.get(5)?,
                client_id: row.get(6)?,
                theme_data: row.get(7)?,
                theme_updated_at: row.get(8)?,
                existing_hash: row.get(9)?,
                final_asset_url: row.get(10)?,
            })
        },
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("plan_item:{item_id}")),
        other => other.into(),
    })
}

fn set_status(
    db: &DbState,
    item_id: &str,
    status: &str,
    asset: Option<&str>,
) -> AppResult<()> {
    let conn = db.conn.lock().unwrap();
    match asset {
        Some(path) => conn.execute(
            "UPDATE plan_items SET status = ?2, final_asset_url = ?3 WHERE id = ?1",
            params![item_id, status, path],
        )?,
        None => conn.execute(
            "UPDATE plan_items SET status = ?2 WHERE id = ?1",
            params![item_id, status],
        )?,
    };
    Ok(())
}

fn asset_path(app: &AppHandle, project_id: &str, item_id: &str, ext: &str) -> AppResult<PathBuf> {
    let dir = fs_ops::ensure_project_dir(app, project_id)?.join("assets");
    fs::create_dir_all(&dir).ok();
    Ok(dir.join(format!("{item_id}.{ext}")))
}

fn emit(
    app: &AppHandle,
    item_id: &str,
    phase: &str,
    message: Option<String>,
    error: Option<String>,
) {
    let _ = app.emit(
        "asset:progress",
        AssetProgress {
            item_id: item_id.to_string(),
            phase: phase.to_string(),
            message,
            error,
        },
    );
}

async fn with_retries<F, Fut, T>(max_attempts: usize, mut f: F) -> AppResult<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = AppResult<T>>,
{
    let mut delay = std::time::Duration::from_secs(1);
    let mut last_err: Option<AppError> = None;
    for attempt in 0..max_attempts {
        match f().await {
            Ok(v) => return Ok(v),
            Err(err) => {
                let msg = err.to_string();
                // Honour explicit rate-limit signals from providers.
                let wait = if let Some(s) = msg.strip_prefix("RATE_LIMIT:") {
                    s.parse::<u64>().ok().map(std::time::Duration::from_secs).unwrap_or(delay)
                } else {
                    delay
                };
                last_err = Some(err);
                if attempt + 1 == max_attempts {
                    break;
                }
                tokio::time::sleep(wait).await;
                delay *= 2;
            }
        }
    }
    Err(last_err.unwrap_or_else(|| AppError::Other("exhausted retries".into())))
}

/* ------------------------------------------------------------------ */
/*  Prompt builders                                                    */
/* ------------------------------------------------------------------ */

fn build_svg_prompts(item: &PlanItemRow, theme: &Value) -> (String, String) {
    let system = "You are an SVG illustrator. Output ONLY a single <svg>…</svg> block. \
                  No explanation, no markdown fences. Root must have xmlns and viewBox=\"0 0 1024 1024\", \
                  no width/height, no <script>, <iframe>, <foreignObject>, <image>, xlink:href. \
                  Flat shapes; max 2–3 colors; use currentColor for the primary animatable color.".to_string();

    let approach = theme
        .pointer("/iconStyle/approach")
        .and_then(|v| v.as_str())
        .unwrap_or("angular");
    let stroke = theme
        .pointer("/iconStyle/strokeWeight")
        .and_then(|v| v.as_f64())
        .unwrap_or(2.0);
    let primary = theme
        .pointer("/colors/primary")
        .and_then(|v| v.as_str())
        .unwrap_or("#C8FF00");
    let accent = theme
        .pointer("/colors/accent")
        .and_then(|v| v.as_str())
        .unwrap_or("#F0F0F0");
    let style_notes = theme
        .get("styleNotes")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let user = format!(
        "Brief: {brief}\n\nStyle approach: {approach}\nStroke weight: {stroke}px\nPrimary color: {primary} (expose as currentColor)\nAccent color: {accent}\n\nSRT context: {context}\n\nStyle notes: {notes}",
        brief = item.brief,
        context = item.srt_context,
        notes = style_notes,
    );
    (system, user)
}

fn build_image_prompt(item: &PlanItemRow, theme: &Value) -> String {
    let approach = theme
        .pointer("/iconStyle/approach")
        .and_then(|v| v.as_str())
        .unwrap_or("angular");
    let fill_style = theme
        .pointer("/iconStyle/fillStyle")
        .and_then(|v| v.as_str())
        .unwrap_or("solid");
    let stroke = theme
        .pointer("/iconStyle/strokeWeight")
        .and_then(|v| v.as_f64())
        .unwrap_or(2.0);
    let primary = theme
        .pointer("/colors/primary")
        .and_then(|v| v.as_str())
        .unwrap_or("#C8FF00");
    let secondary = theme
        .pointer("/colors/secondary")
        .and_then(|v| v.as_str())
        .unwrap_or("#141414");
    let accent = theme
        .pointer("/colors/accent")
        .and_then(|v| v.as_str())
        .unwrap_or("#F0F0F0");
    let style_notes = theme
        .get("styleNotes")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    format!(
        "Generate an isolated illustration for a motion graphics overlay in social video.\n\n\
         SUBJECT: {brief}\n\n\
         VISUAL STYLE:\n\
         - Approach: {approach}\n\
         - Fill style: {fill_style}\n\
         - Stroke weight: {stroke}px where applicable\n\
         - Match the visual language of the reference images below\n\n\
         COLOR PALETTE (keep tight — primary plus at most one other color):\n\
         - Primary: {primary}\n\
         - Secondary: {secondary}\n\
         - Accent: {accent}\n\n\
         TECHNICAL:\n\
         - Transparent background (PNG with alpha)\n\
         - Subject centered, 15% padding on all sides\n\
         - 1024x1024 resolution\n\
         - No text in image\n\
         - Single clean subject\n\n\
         SRT CONTEXT: {context}\n\n\
         STYLE NOTES: {notes}",
        brief = item.brief,
        context = item.srt_context,
        notes = style_notes,
    )
}

fn collect_reference_images(theme: &Value) -> Vec<(String, Vec<u8>)> {
    let refs = theme
        .pointer("/iconStyle/referenceImages")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for v in refs.into_iter().take(3) {
        if let Some(path) = v.as_str() {
            if let Ok(bytes) = fs::read(path) {
                let mime = mime_for_path(path).to_string();
                out.push((mime, bytes));
            }
        }
    }
    out
}

fn mime_for_path(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else {
        "image/png"
    }
}

// Silence the JSON import for now — used by downstream callers.
#[allow(dead_code)]
fn _silence_json() -> Value { json!({}) }
