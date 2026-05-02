mod assets;
mod commands;
mod db;
mod error;
mod export;
mod fs_ops;
mod ipc;
mod logger;
mod media_probe;
mod paths;
mod render;
mod secrets;
mod timeline;
mod whisper;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle().clone();
            if let Err(e) = logger::init(&handle) {
                eprintln!("[logger] init failed: {e}");
            }
            let db_path = paths::db_path(&handle)?;
            if let Some(parent) = db_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut conn = db::open_or_recover(&db_path)?;
            db::migrations::run(&mut conn)?;
            app.manage(db::DbState::new(conn));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_paths,
            commands::list_projects,
            commands::get_project,
            commands::create_project,
            commands::update_project,
            commands::delete_project,
            // BrandKits (formerly Themes)
            commands::list_brand_kits,
            commands::get_brand_kit,
            commands::save_brand_kit,
            commands::delete_brand_kit,
            commands::save_brand_kit_logo,
            commands::save_brand_kit_reference,
            commands::delete_brand_kit_asset,
            // Secrets
            commands::has_api_key,
            commands::set_api_key,
            commands::clear_api_key,
            // FS / IO
            commands::ensure_project_dir,
            commands::copy_srt_into_project,
            commands::read_file_as_string,
            // Usage
            commands::get_usage_since,
            // Reveal
            commands::reveal_in_finder,
            // Logging
            commands::get_log_path,
            commands::clear_logs,
            commands::log_from_frontend,
            // Assets
            assets::import_asset,
            assets::list_assets,
            assets::get_asset,
            assets::delete_asset,
            assets::list_asset_tags,
            assets::set_asset_tags,
            assets::search_assets,
            // Timeline
            timeline::load_timeline,
            timeline::save_timeline,
            timeline::create_default_tracks,
            // Render
            render::render_timeline,
            // Whisper
            whisper::whisper_model_status,
            whisper::whisper_download_model,
            whisper::whisper_transcribe,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
