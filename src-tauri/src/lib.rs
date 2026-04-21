mod db;
mod error;
mod paths;
mod secrets;
mod commands;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let db_path = paths::db_path(&handle)?;
            if let Some(parent) = db_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let conn = db::open(&db_path)?;
            db::migrate(&conn)?;
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
            commands::list_presets,
            commands::save_preset,
            commands::delete_preset,
            commands::get_api_key,
            commands::set_api_key,
            commands::clear_api_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
