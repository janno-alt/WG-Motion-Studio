mod commands;
mod db;
mod error;
mod export;
mod fs_ops;
mod logger;
mod paths;
mod secrets;

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
            commands::list_themes,
            commands::get_theme,
            commands::save_theme,
            commands::delete_theme,
            commands::has_api_key,
            commands::set_api_key,
            commands::clear_api_key,
            commands::ensure_project_dir,
            commands::copy_srt_into_project,
            commands::save_theme_reference_image,
            commands::delete_theme_reference_image,
            commands::read_file_as_string,
            commands::get_usage_since,
            commands::reveal_in_finder,
            commands::get_log_path,
            commands::clear_logs,
            commands::log_from_frontend,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
