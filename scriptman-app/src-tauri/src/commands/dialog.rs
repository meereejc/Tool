use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};

use crate::commands::transport::CommandResult;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectDirectoriesInput {
    pub multiple: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectDirectoriesData {
    pub paths: Vec<String>,
}

#[tauri::command]
pub async fn select_directories(
    app: AppHandle,
    input: SelectDirectoriesInput,
) -> CommandResult<SelectDirectoriesData> {
    let allow_multiple = input.multiple.unwrap_or(true);

    let paths = if allow_multiple {
        app.dialog()
            .file()
            .blocking_pick_folders()
            .unwrap_or_default()
            .into_iter()
            .filter_map(normalize_path)
            .collect()
    } else {
        app.dialog()
            .file()
            .blocking_pick_folder()
            .into_iter()
            .filter_map(normalize_path)
            .collect()
    };

    CommandResult::ok(SelectDirectoriesData { paths })
}

fn normalize_path(path: FilePath) -> Option<String> {
    path.into_path()
        .ok()
        .map(|path| path.to_string_lossy().into_owned())
}
