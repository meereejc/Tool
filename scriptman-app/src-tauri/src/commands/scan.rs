use std::path::PathBuf;

use serde::Deserialize;
use tauri::{AppHandle, Manager};

use crate::commands::transport::CommandResult;
use crate::core::config_store::ConfigStore;
use crate::core::scanner::scan_paths;
use crate::core::types::{AppConfig, ScanResult};

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanDirectoriesInput {
    pub paths: Option<Vec<String>>,
    pub loose_mode: Option<bool>,
}

#[tauri::command]
pub fn scan_directories(
    app: AppHandle,
    input: Option<ScanDirectoriesInput>,
) -> CommandResult<ScanResult> {
    let config = match load_app_config(&app) {
        Ok(config) => config,
        Err(detail) => {
            return CommandResult::err("SCAN_FAILED", "Failed to load scan config", Some(detail))
        }
    };

    let input = input.unwrap_or_default();
    let paths = match resolve_scan_paths(input.paths, &config) {
        Ok(paths) => paths,
        Err(message) => return CommandResult::err("INVALID_ARGUMENT", message, None),
    };
    let loose_mode = input.loose_mode.unwrap_or(config.scan_loose_mode);
    let path_bufs = paths.into_iter().map(PathBuf::from).collect::<Vec<_>>();

    match scan_paths(&path_bufs, loose_mode) {
        Ok(result) => CommandResult::ok(result),
        Err(error) => CommandResult::err(
            "SCAN_FAILED",
            "Failed to scan directories",
            Some(error.to_string()),
        ),
    }
}

fn load_app_config(app: &AppHandle) -> Result<AppConfig, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    let store = ConfigStore::new(config_dir);

    store.load().map_err(|error| error.to_string())
}

fn resolve_scan_paths(
    requested_paths: Option<Vec<String>>,
    config: &AppConfig,
) -> Result<Vec<String>, &'static str> {
    let requested = requested_paths
        .unwrap_or_default()
        .into_iter()
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty())
        .collect::<Vec<_>>();

    if !requested.is_empty() {
        return Ok(requested);
    }

    if !config.watch_paths.is_empty() {
        return Ok(config.watch_paths.clone());
    }

    Err("No scan directories configured.")
}

#[cfg(test)]
mod tests {
    use crate::core::types::AppConfig;

    use super::*;

    #[test]
    fn resolve_scan_paths_falls_back_to_config_watch_paths() {
        let config = AppConfig {
            watch_paths: vec!["/tmp/scripts".into()],
            ..AppConfig::default()
        };

        let resolved = resolve_scan_paths(None, &config).unwrap();

        assert_eq!(resolved, vec!["/tmp/scripts"]);
    }

    #[test]
    fn resolve_scan_paths_rejects_empty_request_and_empty_config() {
        let error = resolve_scan_paths(None, &AppConfig::default()).unwrap_err();

        assert_eq!(error, "No scan directories configured.");
    }
}
