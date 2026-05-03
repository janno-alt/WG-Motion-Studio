use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::db::DbState;
use crate::error::AppResult;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub project_id: String,
    pub kind: String,
    pub name: String,
    pub sort_order: i64,
    pub muted: bool,
    pub hidden: bool,
    pub volume: f64,
    pub pan: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: String,
    pub track_id: String,
    #[serde(default)]
    pub asset_id: Option<String>,
    pub kind: String,
    pub start_sec: f64,
    pub duration_sec: f64,
    pub in_point_sec: f64,
    pub out_point_sec: f64,
    #[serde(default)]
    pub data: Option<Value>,
    pub sort_order: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Timeline {
    pub project_id: String,
    pub tracks: Vec<Track>,
    pub clips: Vec<Clip>,
}

#[tauri::command]
pub fn load_timeline(db: State<'_, DbState>, project_id: String) -> AppResult<Timeline> {
    let conn = db.conn.lock().unwrap();
    let tracks = read_tracks(&conn, &project_id)?;
    let clips = read_clips_for_project(&conn, &project_id)?;
    Ok(Timeline { project_id, tracks, clips })
}

#[tauri::command]
pub fn save_timeline(db: State<'_, DbState>, timeline: Timeline) -> AppResult<Timeline> {
    {
        let mut conn = db.conn.lock().unwrap();
        let tx = conn.transaction()?;

        tx.execute(
            "DELETE FROM clips WHERE track_id IN (SELECT id FROM tracks WHERE project_id = ?1)",
            params![timeline.project_id],
        )?;
        tx.execute(
            "DELETE FROM tracks WHERE project_id = ?1",
            params![timeline.project_id],
        )?;

        for t in &timeline.tracks {
            tx.execute(
                "INSERT INTO tracks (id, project_id, kind, name, sort_order, muted, hidden, volume, pan)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    t.id, t.project_id, t.kind, t.name, t.sort_order,
                    t.muted as i64, t.hidden as i64, t.volume, t.pan
                ],
            )?;
        }

        for c in &timeline.clips {
            let data = c.data.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default());
            tx.execute(
                "INSERT INTO clips (id, track_id, asset_id, kind, start_sec, duration_sec,
                                    in_point_sec, out_point_sec, data, sort_order)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    c.id, c.track_id, c.asset_id, c.kind, c.start_sec, c.duration_sec,
                    c.in_point_sec, c.out_point_sec, data, c.sort_order
                ],
            )?;
        }

        tx.commit()?;
    }
    load_timeline(db, timeline.project_id)
}

#[tauri::command]
pub fn create_default_tracks(
    db: State<'_, DbState>,
    project_id: String,
) -> AppResult<Vec<Track>> {
    let conn = db.conn.lock().unwrap();
    let existing = read_tracks(&conn, &project_id)?;
    if !existing.is_empty() {
        return Ok(existing);
    }
    // sort_order controls layering for the renderer / composition: higher
    // sort_order = drawn last = on top. V3 sits visually on top of V1.
    // Visual track-list order in the UI is reversed independently.
    let defs = [
        ("video", "V1", 0i64),
        ("video", "V2", 1),
        ("video", "V3", 2),
        ("audio", "A1", 3),
        ("audio", "A2", 4),
        ("audio", "A3", 5),
        ("captions", "Captions", 6),
    ];
    for (kind, name, order) in &defs {
        let id = format!("trk-{}", crate::commands::now_ms() + order);
        conn.execute(
            "INSERT INTO tracks (id, project_id, kind, name, sort_order, muted, hidden, volume, pan)
             VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 1.0, 0.0)",
            params![id, project_id, kind, name, order],
        )?;
    }
    read_tracks(&conn, &project_id)
}

fn read_tracks(conn: &Connection, project_id: &str) -> AppResult<Vec<Track>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, kind, name, sort_order, muted, hidden, volume, pan
           FROM tracks WHERE project_id = ?1 ORDER BY sort_order ASC",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(Track {
            id: row.get(0)?,
            project_id: row.get(1)?,
            kind: row.get(2)?,
            name: row.get(3)?,
            sort_order: row.get(4)?,
            muted: row.get::<_, i64>(5)? != 0,
            hidden: row.get::<_, i64>(6)? != 0,
            volume: row.get(7)?,
            pan: row.get(8)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

fn read_clips_for_project(conn: &Connection, project_id: &str) -> AppResult<Vec<Clip>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.track_id, c.asset_id, c.kind, c.start_sec, c.duration_sec,
                c.in_point_sec, c.out_point_sec, c.data, c.sort_order
           FROM clips c
           JOIN tracks t ON t.id = c.track_id
          WHERE t.project_id = ?1
          ORDER BY t.sort_order, c.sort_order",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        let data_str: Option<String> = row.get(8)?;
        Ok(Clip {
            id: row.get(0)?,
            track_id: row.get(1)?,
            asset_id: row.get(2)?,
            kind: row.get(3)?,
            start_sec: row.get(4)?,
            duration_sec: row.get(5)?,
            in_point_sec: row.get(6)?,
            out_point_sec: row.get(7)?,
            data: data_str.and_then(|s| serde_json::from_str(&s).ok()),
            sort_order: row.get(9)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}
