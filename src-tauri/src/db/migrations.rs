use rusqlite::Connection;

use crate::error::AppResult;

/// Ordered list of migrations. Each entry is `(version, sql)`. Versions must be
/// monotonically increasing. On startup the highest applied version is compared
/// against this list and every newer migration is run in a single transaction.
///
/// NEVER edit a migration that has shipped. Add a new one instead.
const MIGRATIONS: &[(i32, &str)] = &[(
    1,
    r#"
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      client_id TEXT NOT NULL,
      srt_path TEXT NOT NULL,
      video_path TEXT,
      video_format TEXT NOT NULL,
      video_duration REAL NOT NULL,
      fps INTEGER NOT NULL,
      settings TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE plan_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      timestamp REAL NOT NULL,
      duration REAL NOT NULL,
      tier INTEGER NOT NULL,
      component_type TEXT,
      brief TEXT NOT NULL,
      srt_context TEXT NOT NULL,
      status TEXT NOT NULL,
      preview_url TEXT,
      final_asset_url TEXT,
      base_state TEXT NOT NULL,
      animation TEXT NOT NULL,
      style_variant TEXT,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE themes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      built_in INTEGER NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cost_usd REAL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX idx_plan_items_project ON plan_items(project_id, sort_order);
    CREATE INDEX idx_usage_project ON api_usage(project_id);
    CREATE INDEX idx_usage_date ON api_usage(created_at);
    "#,
)];

pub fn run(conn: &mut Connection) -> AppResult<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)",
        [],
    )?;

    let current: i32 = conn
        .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_version", [], |row| {
            row.get(0)
        })?;

    for (version, sql) in MIGRATIONS {
        if *version <= current {
            continue;
        }
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.execute("INSERT INTO schema_version (version) VALUES (?1)", [version])?;
        tx.commit()?;
        eprintln!("[db] migration {version} applied");
    }
    Ok(())
}
