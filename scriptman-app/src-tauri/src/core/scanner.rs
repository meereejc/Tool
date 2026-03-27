use std::fs;
use std::path::{Path, PathBuf};

use crate::core::meta_parser::parse_script_meta;
use crate::core::types::{ScanResult, ScriptAsset, ScriptLanguage, ScriptStatus};

const IGNORED_DIRS: &[&str] = &[
    ".git",
    ".venv",
    "venv",
    "node_modules",
    "__pycache__",
    "dist",
    "build",
    "target",
];

const IGNORED_FILES: &[&str] = &["__init__.py"];

#[derive(Debug)]
pub struct ScanError {
    message: String,
}

impl ScanError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for ScanError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ScanError {}

pub fn scan_paths(paths: &[PathBuf], loose_mode: bool) -> Result<ScanResult, ScanError> {
    let mut result = ScanResult::default();

    for root in paths {
        if !root.exists() {
            result
                .errors
                .push(format!("Scan root does not exist: {}", root.display()));
            continue;
        }

        visit_path(root, loose_mode, &mut result);
    }

    Ok(result)
}

fn visit_path(path: &Path, loose_mode: bool, result: &mut ScanResult) {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();

    if path.is_dir() {
        if IGNORED_DIRS.contains(&file_name) {
            result.ignored_count += 1;
            return;
        }

        let entries = match fs::read_dir(path) {
            Ok(entries) => entries,
            Err(error) => {
                result
                    .errors
                    .push(format!("Failed to read directory {}: {error}", path.display()));
                return;
            }
        };

        for entry in entries {
            match entry {
                Ok(entry) => visit_path(&entry.path(), loose_mode, result),
                Err(error) => result
                    .errors
                    .push(format!("Failed to read directory entry in {}: {error}", path.display())),
            }
        }

        return;
    }

    if !path.is_file() {
        return;
    }

    if IGNORED_FILES.contains(&file_name) {
        result.ignored_count += 1;
        return;
    }

    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) => {
            result
                .errors
                .push(format!("Failed to read file {}: {error}", path.display()));
            return;
        }
    };

    let Some(language) = detect_candidate(path, &content, loose_mode) else {
        result.ignored_count += 1;
        return;
    };

    let meta = parse_script_meta(&content);
    let status = if meta.is_some() {
        ScriptStatus::Configured
    } else {
        ScriptStatus::PendingMeta
    };

    let asset = ScriptAsset {
        id: path
            .canonicalize()
            .unwrap_or_else(|_| path.to_path_buf())
            .to_string_lossy()
            .into_owned(),
        file_path: path.to_string_lossy().into_owned(),
        file_name: file_name.to_string(),
        language,
        status: status.clone(),
        meta,
        env_status: None,
    };

    match status {
        ScriptStatus::Configured => result.configured_scripts.push(asset),
        ScriptStatus::PendingMeta => result.pending_scripts.push(asset),
    }
}

fn detect_candidate(path: &Path, content: &str, loose_mode: bool) -> Option<ScriptLanguage> {
    let extension = path.extension().and_then(|ext| ext.to_str())?;
    let first_line = content.lines().next().unwrap_or_default().trim();

    match extension {
        "py" => {
            if loose_mode || has_python_shebang(first_line) || has_python_entry(content) {
                Some(ScriptLanguage::Python)
            } else {
                None
            }
        }
        "sh" | "bash" | "zsh" => Some(ScriptLanguage::Shell),
        "js" | "mjs" | "cjs" => {
            if loose_mode || has_node_shebang(first_line) || has_node_cli_marker(content) {
                Some(ScriptLanguage::Node)
            } else {
                None
            }
        }
        _ => {
            if has_shell_shebang(first_line) {
                Some(ScriptLanguage::Shell)
            } else {
                None
            }
        }
    }
}

fn has_python_shebang(first_line: &str) -> bool {
    first_line.starts_with("#!") && first_line.to_ascii_lowercase().contains("python")
}

fn has_shell_shebang(first_line: &str) -> bool {
    if !first_line.starts_with("#!") {
        return false;
    }

    let lower = first_line.to_ascii_lowercase();
    lower.contains("sh") || lower.contains("bash") || lower.contains("zsh")
}

fn has_node_shebang(first_line: &str) -> bool {
    first_line.starts_with("#!") && first_line.to_ascii_lowercase().contains("node")
}

fn has_python_entry(content: &str) -> bool {
    content.contains("if __name__ == \"__main__\":")
        || content.contains("if __name__ == '__main__':")
}

fn has_node_cli_marker(content: &str) -> bool {
    content.contains("require.main === module")
        || content.contains("require.main===module")
        || content.contains("process.argv")
        || content.contains("import.meta.url")
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    use tempfile::tempdir;

    use super::*;

    #[test]
    fn classifies_configured_and_pending_scripts() {
        let root = tempdir().unwrap();

        write_file(
            &root.path().join("configured.py"),
            r#"#!/usr/bin/env python3
# @sm:name Configured Demo
print("ok")
"#,
        );
        write_file(
            &root.path().join("pending.py"),
            r#"#!/usr/bin/env python3
print("pending")
"#,
        );
        write_file(
            &root.path().join("module.py"),
            r#"def helper():
    return 1
"#,
        );
        write_file(
            &root.path().join("node_modules/ignored.js"),
            r#"#!/usr/bin/env node
console.log("ignored");
"#,
        );

        let result = scan_paths(&[root.path().to_path_buf()], false).unwrap();

        assert_eq!(result.configured_scripts.len(), 1);
        assert_eq!(result.pending_scripts.len(), 1);
        assert!(result.ignored_count >= 2);
        assert!(result.errors.is_empty());
        assert_eq!(result.configured_scripts[0].file_name, "configured.py");
        assert_eq!(result.pending_scripts[0].file_name, "pending.py");
    }

    #[test]
    fn loose_mode_includes_extension_based_candidates_without_entry_markers() {
        let root = tempdir().unwrap();
        write_file(
            &root.path().join("loose.py"),
            r#"print("extension only")
"#,
        );

        let strict_result = scan_paths(&[root.path().to_path_buf()], false).unwrap();
        let loose_result = scan_paths(&[root.path().to_path_buf()], true).unwrap();

        assert!(strict_result.pending_scripts.is_empty());
        assert_eq!(loose_result.pending_scripts.len(), 1);
        assert_eq!(loose_result.pending_scripts[0].file_name, "loose.py");
    }

    fn write_file(path: &Path, content: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }

        fs::write(path, content).unwrap();
    }
}
