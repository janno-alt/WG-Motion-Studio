use rusqlite::Connection;

use crate::error::AppResult;

/// Ordered list of migrations. Each entry is `(version, sql)`. Versions must be
/// monotonically increasing. On startup the highest applied version is compared
/// against this list and every newer migration is run in a single transaction.
///
/// NEVER edit a migration that has shipped. Add a new one instead.
const MIGRATIONS: &[(i32, &str)] = &[
    (
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
    ),
    (
        2,
        r#"
        ALTER TABLE plan_items ADD COLUMN asset_hash TEXT;
        ALTER TABLE plan_items ADD COLUMN generated_at INTEGER;
        "#,
    ),
    (
        3,
        r#"
        DROP INDEX IF EXISTS idx_plan_items_project;
        DROP TABLE IF EXISTS plan_items;
        DROP TABLE IF EXISTS presets;

        CREATE TABLE assets (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          thumbnail_path TEXT,
          duration_sec REAL,
          width INTEGER,
          height INTEGER,
          fps REAL,
          audio_channels INTEGER,
          audio_sample_rate INTEGER,
          size_bytes INTEGER,
          imported_at INTEGER NOT NULL
        );

        CREATE TABLE tracks (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          name TEXT NOT NULL,
          sort_order INTEGER NOT NULL,
          muted INTEGER NOT NULL DEFAULT 0,
          hidden INTEGER NOT NULL DEFAULT 0,
          volume REAL NOT NULL DEFAULT 1.0,
          pan REAL NOT NULL DEFAULT 0.0
        );

        CREATE TABLE clips (
          id TEXT PRIMARY KEY,
          track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
          asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
          kind TEXT NOT NULL,
          start_sec REAL NOT NULL,
          duration_sec REAL NOT NULL,
          in_point_sec REAL NOT NULL DEFAULT 0,
          out_point_sec REAL NOT NULL,
          data TEXT,
          sort_order INTEGER NOT NULL
        );

        CREATE TABLE renders (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          preset TEXT NOT NULL,
          output_path TEXT NOT NULL,
          status TEXT NOT NULL,
          progress REAL NOT NULL DEFAULT 0,
          error TEXT,
          started_at INTEGER,
          finished_at INTEGER,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX idx_assets_project ON assets(project_id);
        CREATE INDEX idx_tracks_project ON tracks(project_id, sort_order);
        CREATE INDEX idx_clips_track ON clips(track_id, sort_order);
        CREATE INDEX idx_renders_project ON renders(project_id, created_at);
        "#,
    ),
    (
        4,
        r#"
        ALTER TABLE themes RENAME TO brand_kits;
        ALTER TABLE brand_kits ADD COLUMN client_name TEXT;
        ALTER TABLE brand_kits ADD COLUMN logo_path TEXT;

        CREATE TABLE asset_tags (
          asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
          tag TEXT NOT NULL,
          PRIMARY KEY (asset_id, tag)
        );
        CREATE INDEX idx_asset_tags_tag ON asset_tags(tag);

        CREATE VIRTUAL TABLE assets_fts USING fts5(
          name,
          tags,
          content=''
        );
        "#,
    ),
    (
        5,
        r#"
        -- Rebuild projects to make client_id nullable. The 12-step procedure
        -- collapses to "create new, copy, drop old, rename" because we have
        -- foreign_keys disabled at the connection level around the migration.
        CREATE TABLE projects_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          client_id TEXT,
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
        INSERT INTO projects_new SELECT * FROM projects;
        DROP TABLE projects;
        ALTER TABLE projects_new RENAME TO projects;

        -- BrandKit no longer carries a logo (handled in the editor by removing
        -- the section + the FS helpers that wrote into brand_kits/<id>/logo-N).
        ALTER TABLE brand_kits DROP COLUMN logo_path;
        "#,
    ),
];

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
        // Disable FK enforcement around table rebuilds so DROP TABLE on a
        // referenced parent doesn't fail. The migration body is responsible
        // for leaving the DB in a referentially valid state by COMMIT time.
        conn.pragma_update(None, "foreign_keys", "OFF")?;
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.execute("INSERT INTO schema_version (version) VALUES (?1)", [version])?;
        tx.commit()?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        eprintln!("[db] migration {version} applied");
    }
    Ok(())
}
