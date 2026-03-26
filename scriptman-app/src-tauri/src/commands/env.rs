use std::path::PathBuf;

use serde::Deserialize;

use crate::commands::transport::CommandResult;
use crate::core::env_checker::{
    check_script_env as core_check_script_env,
    suggest_env_setup_commands as core_suggest_env_setup_commands,
};
use crate::core::types::{EnvCheckResult, EnvSetupCommand};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckScriptEnvInput {
    pub script_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestEnvSetupCommandsInput {
    pub script_path: String,
    pub missing_items: Vec<String>,
}

#[tauri::command]
pub fn check_script_env(input: CheckScriptEnvInput) -> CommandResult<EnvCheckResult> {
    if input.script_path.trim().is_empty() {
        return CommandResult::err("INVALID_ARGUMENT", "scriptPath is required.", None);
    }

    match core_check_script_env(&PathBuf::from(input.script_path)) {
        Ok(result) => CommandResult::ok(result),
        Err(error) => CommandResult::err(
            "ENV_CHECK_FAILED",
            "Failed to check script environment",
            Some(error.to_string()),
        ),
    }
}

#[tauri::command]
pub fn suggest_env_setup_commands(input: SuggestEnvSetupCommandsInput) -> CommandResult<Vec<EnvSetupCommand>> {
    if input.script_path.trim().is_empty() {
        return CommandResult::err("INVALID_ARGUMENT", "scriptPath is required.", None);
    }

    match core_suggest_env_setup_commands(&PathBuf::from(input.script_path), &input.missing_items) {
        Ok(commands) => CommandResult::ok(commands),
        Err(error) => CommandResult::err(
            "ENV_CHECK_FAILED",
            "Failed to generate environment suggestions",
            Some(error.to_string()),
        ),
    }
}
