use rusqlite::{Connection, params};
use serde_json::json;

use crate::error::AppResult;

/// Seeds built-in example themes on first run (when themes table is empty).
pub fn ensure_default_themes(conn: &Connection) -> AppResult<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM themes", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }

    let now = now_ms();
    let themes = default_themes(now);

    for t in themes {
        let id = t["id"].as_str().unwrap_or_default().to_string();
        let name = t["name"].as_str().unwrap_or_default().to_string();
        let data = serde_json::to_string(&t)?;
        conn.execute(
            "INSERT INTO themes (id, name, data, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)",
            params![id, name, data, now],
        )?;
    }
    eprintln!("[db] seeded default themes");
    Ok(())
}

fn default_themes(now: i64) -> Vec<serde_json::Value> {
    vec![
        json!({
            "id": "mat-brandschutz",
            "name": "MAT Brandschutz",
            "colors": {
                "primary": "#E63946",
                "secondary": "#1D3557",
                "accent": "#F1FAEE",
                "background": "#0B0C0F"
            },
            "typography": {
                "headlineFont": "Inter",
                "bodyFont": "Inter"
            },
            "iconStyle": {
                "approach": "angular",
                "strokeWeight": 2,
                "fillStyle": "solid",
                "referenceImages": []
            },
            "animationPersonality": {
                "speed": 60,
                "springiness": 30,
                "entryStyle": "slide"
            },
            "preferredPresets": [],
            "styleNotes": "Industrial, authoritative, safety-focused. Prefer clean hard edges and high-contrast reds against deep navy.",
            "createdAt": now,
            "updatedAt": now
        }),
        json!({
            "id": "flowmotion",
            "name": "FlowMotion",
            "colors": {
                "primary": "#2ECC71",
                "secondary": "#27AE60",
                "accent": "#F8F9FA",
                "background": "#101713"
            },
            "typography": {
                "headlineFont": "Inter",
                "bodyFont": "Inter"
            },
            "iconStyle": {
                "approach": "rounded",
                "strokeWeight": 1.5,
                "fillStyle": "duotone",
                "referenceImages": []
            },
            "animationPersonality": {
                "speed": 50,
                "springiness": 70,
                "entryStyle": "mixed"
            },
            "preferredPresets": [],
            "styleNotes": "Friendly, organic, movement-driven. Lean on bouncy springs and rounded shapes.",
            "createdAt": now,
            "updatedAt": now
        }),
        json!({
            "id": "wg-digital",
            "name": "WG-Digital",
            "colors": {
                "primary": "#C8FF00",
                "secondary": "#0A0A0A",
                "accent": "#F0F0F0",
                "background": "#0A0A0A"
            },
            "typography": {
                "headlineFont": "Inter",
                "bodyFont": "Inter"
            },
            "iconStyle": {
                "approach": "angular",
                "strokeWeight": 2,
                "fillStyle": "outline",
                "referenceImages": []
            },
            "animationPersonality": {
                "speed": 75,
                "springiness": 50,
                "entryStyle": "pop"
            },
            "preferredPresets": [],
            "styleNotes": "High-tech, confident, minimal. Neon-lime accent on deep black. Snappy motion with clean pops.",
            "createdAt": now,
            "updatedAt": now
        }),
    ]
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
