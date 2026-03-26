use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    pub watch_paths: Vec<String>,
    pub default_cwd: Option<String>,
    pub scan_loose_mode: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct ParamDef {
    pub name: String,
    pub value_type: String,
    pub required: bool,
    pub description: String,
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct ScriptMeta {
    pub name: Option<String>,
    pub category: Option<String>,
    pub desc: Option<String>,
    pub platform: Option<String>,
    pub runtime: Option<String>,
    pub deps: Vec<String>,
    pub input_hint: Option<String>,
    pub output_hint: Option<String>,
    pub params: Vec<ParamDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ScriptStatus {
    Configured,
    PendingMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ScriptLanguage {
    Python,
    Shell,
    Node,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct EnvCheckResult {
    pub ok: bool,
    pub permission_ok: bool,
    pub runtime_ok: bool,
    pub deps_ok: bool,
    pub missing_items: Vec<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct EnvSetupCommand {
    pub title: String,
    pub command: String,
    pub requires_privilege: Option<bool>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptAsset {
    pub id: String,
    pub file_path: String,
    pub file_name: String,
    pub language: ScriptLanguage,
    pub status: ScriptStatus,
    pub meta: Option<ScriptMeta>,
    pub env_status: Option<EnvCheckResult>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct ScanResult {
    pub configured_scripts: Vec<ScriptAsset>,
    pub pending_scripts: Vec<ScriptAsset>,
    pub ignored_count: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct RunScriptData {
    pub execution_id: String,
    pub started: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct ExecutionLogEvent {
    pub execution_id: String,
    pub stream: String,
    pub line: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct ExecutionExitEvent {
    pub execution_id: String,
    pub exit_code: Option<i32>,
    pub success: bool,
}
