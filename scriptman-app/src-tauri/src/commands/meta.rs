use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::commands::transport::CommandResult;
use crate::core::meta_writer::write_script_meta;
use crate::core::types::ScriptMeta;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveScriptMetaInput {
    pub script_path: String,
    pub meta: ScriptMeta,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveScriptMetaData {
    pub saved: bool,
}

#[tauri::command]
pub fn save_script_meta(input: SaveScriptMetaInput) -> CommandResult<SaveScriptMetaData> {
    if input.script_path.trim().is_empty() {
        return CommandResult::err("INVALID_ARGUMENT", "scriptPath is required.", None);
    }

    if input
        .meta
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_none()
    {
        return CommandResult::err("INVALID_ARGUMENT", "meta.name is required.", None);
    }

    if input
        .meta
        .desc
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_none()
    {
        return CommandResult::err("INVALID_ARGUMENT", "meta.desc is required.", None);
    }

    match write_script_meta(&PathBuf::from(input.script_path), &input.meta) {
        Ok(()) => CommandResult::ok(SaveScriptMetaData { saved: true }),
        Err(error) => CommandResult::err(
            "META_SAVE_FAILED",
            "Failed to save script metadata",
            Some(error.to_string()),
        ),
    }
}
