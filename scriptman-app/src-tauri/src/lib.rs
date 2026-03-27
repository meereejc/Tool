pub mod commands;
pub mod core;

use commands::{
    check_script_env, load_config, run_script, save_config, scan_directories, select_directories,
    save_script_meta, stop_script, suggest_env_setup_commands,
};
use core::executor::ExecutionRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ExecutionRegistry::default())
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            select_directories,
            scan_directories,
            check_script_env,
            suggest_env_setup_commands,
            save_script_meta,
            run_script,
            stop_script
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
