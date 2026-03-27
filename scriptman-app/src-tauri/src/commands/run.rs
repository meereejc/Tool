use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

use crate::commands::transport::CommandResult;
use crate::core::config_store::ConfigStore;
use crate::core::env_checker::{check_script_env, load_script_runtime_context};
use crate::core::executor::{start_script_execution, stop_execution, ExecutionRegistry};
use crate::core::types::RunScriptData;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunScriptInput {
    pub script_path: String,
    #[serde(default)]
    pub args: BTreeMap<String, Value>,
    pub cwd: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StopScriptInput {
    pub execution_id: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StopScriptData {
    pub stopped: bool,
}

#[tauri::command]
pub fn run_script(
    app: AppHandle,
    registry: State<'_, ExecutionRegistry>,
    input: RunScriptInput,
) -> CommandResult<RunScriptData> {
    if input.script_path.trim().is_empty() {
        return CommandResult::err("INVALID_ARGUMENT", "scriptPath is required.", None);
    }

    let script_path = PathBuf::from(&input.script_path);
    if !script_path.is_file() {
        return CommandResult::err("INVALID_ARGUMENT", "Script file does not exist.", None);
    }

    let env_status = match check_script_env(&script_path) {
        Ok(result) => result,
        Err(error) => {
            return CommandResult::err(
                "ENV_CHECK_FAILED",
                "Failed to check script environment",
                Some(error.to_string()),
            )
        }
    };

    if !env_status.ok {
        return CommandResult::err(
            "RUN_FAILED",
            env_status
                .message
                .unwrap_or_else(|| "Script environment check failed.".to_string()),
            None,
        );
    }

    let context = match load_script_runtime_context(&script_path) {
        Ok(context) => context,
        Err(error) => {
            return CommandResult::err(
                "RUN_FAILED",
                "Failed to resolve script runtime",
                Some(error.to_string()),
            )
        }
    };

    let execution_cwd = match resolve_execution_cwd(&app, input.cwd.as_deref(), &script_path) {
        Ok(path) => path,
        Err(error) => {
            return CommandResult::err(
                "RUN_FAILED",
                "Failed to resolve working directory",
                Some(error.to_string()),
            )
        }
    };

    match start_script_execution(
        app,
        registry.inner().clone(),
        &context.runtime_command,
        &script_path,
        &input.args,
        &execution_cwd,
    ) {
        Ok(data) => CommandResult::ok(data),
        Err(error) => CommandResult::err(
            "RUN_FAILED",
            "Failed to start script execution",
            Some(error.to_string()),
        ),
    }
}

#[tauri::command]
pub fn stop_script(
    registry: State<'_, ExecutionRegistry>,
    input: StopScriptInput,
) -> CommandResult<StopScriptData> {
    if input.execution_id.trim().is_empty() {
        return CommandResult::err("INVALID_ARGUMENT", "executionId is required.", None);
    }

    match stop_execution(registry.inner(), &input.execution_id) {
        Ok(stopped) => CommandResult::ok(StopScriptData { stopped }),
        Err(error) => CommandResult::err(
            "RUN_STOP_FAILED",
            "Failed to stop script execution",
            Some(error.to_string()),
        ),
    }
}

fn resolve_execution_cwd(
    app: &AppHandle,
    requested_cwd: Option<&str>,
    script_path: &Path,
) -> Result<PathBuf, String> {
    if let Some(cwd) = requested_cwd.map(str::trim).filter(|value| !value.is_empty()) {
        return Ok(PathBuf::from(cwd));
    }

    if let Ok(config_dir) = app.path().app_config_dir() {
        let store = ConfigStore::new(config_dir);
        if let Ok(config) = store.load() {
            if let Some(default_cwd) = config.default_cwd.filter(|value| !value.trim().is_empty()) {
                return Ok(PathBuf::from(default_cwd));
            }
        }
    }

    script_path
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Failed to resolve script parent directory.".to_string())
}
