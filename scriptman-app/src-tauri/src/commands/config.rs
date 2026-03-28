use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::commands::transport::CommandResult;
use crate::core::config_store::ConfigStore;
use crate::core::types::AppConfig;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConfigInput {
    pub config: AppConfig,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConfigData {
    pub saved: bool,
}

#[tauri::command]
pub fn load_config(app: AppHandle) -> CommandResult<AppConfig> {
    match resolve_config_store(&app).and_then(|store| {
        store
            .load()
            .map_err(|error| ("CONFIG_LOAD_FAILED", "Failed to load config", error.to_string()))
    }) {
        Ok(config) => CommandResult::ok(config),
        Err((code, message, detail)) => CommandResult::err(code, message, Some(detail)),
    }
}

#[tauri::command]
pub fn save_config(app: AppHandle, input: SaveConfigInput) -> CommandResult<SaveConfigData> {
    if let Err(message) = validate_watch_paths(&input.config) {
        return CommandResult::err("INVALID_ARGUMENT", message, None);
    }

    match resolve_config_store(&app).and_then(|store| {
        store
            .save(&input.config)
            .map_err(|error| ("CONFIG_SAVE_FAILED", "Failed to save config", error.to_string()))
    }) {
        Ok(()) => CommandResult::ok(SaveConfigData { saved: true }),
        Err((code, message, detail)) => CommandResult::err(code, message, Some(detail)),
    }
}

fn resolve_config_store(app: &AppHandle) -> Result<ConfigStore, (&'static str, &'static str, String)> {
    app.path()
        .app_config_dir()
        .map(ConfigStore::new)
        .map_err(|error| {
            (
                "CONFIG_LOAD_FAILED",
                "Failed to resolve config directory",
                error.to_string(),
            )
        })
}

fn validate_watch_paths(config: &AppConfig) -> Result<(), &'static str> {
    if config
        .watch_paths
        .iter()
        .any(|path| path.trim().is_empty())
    {
        return Err("Watch paths cannot be empty strings.");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::core::types::AppConfig;

    use super::*;

    #[test]
    fn save_config_accepts_empty_watch_paths() {
        let config = AppConfig::default();

        let result = validate_watch_paths(&config);

        assert!(result.is_ok());
    }

    #[test]
    fn save_config_accepts_multiple_watch_paths() {
        let config = AppConfig {
            watch_paths: vec!["/a".into(), "/b".into()],
            ..AppConfig::default()
        };

        let result = validate_watch_paths(&config);

        assert!(result.is_ok());
    }

    #[test]
    fn save_config_rejects_blank_watch_path_entries() {
        let config = AppConfig {
            watch_paths: vec!["/a".into(), "   ".into()],
            ..AppConfig::default()
        };

        let result = validate_watch_paths(&config);

        assert!(result.is_err());
    }
}
