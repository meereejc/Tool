use std::env;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

use crate::core::meta_parser::parse_script_meta;
use crate::core::types::{EnvCheckResult, EnvSetupCommand, ScriptMeta};

#[derive(Debug)]
pub struct EnvCheckError {
    message: String,
}

impl EnvCheckError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for EnvCheckError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for EnvCheckError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlatformKind {
    Macos,
    Linux,
    Windows,
}

#[derive(Debug, Clone)]
pub struct ScriptRuntimeContext {
    pub runtime_command: String,
    pub meta: Option<ScriptMeta>,
}

pub fn check_script_env(script_path: &Path) -> Result<EnvCheckResult, EnvCheckError> {
    let content = fs::read_to_string(script_path).map_err(|error| {
        EnvCheckError::new(format!("Failed to read script {}: {error}", script_path.display()))
    })?;

    check_script_env_with_resolver(script_path, &content, &command_exists)
}

pub fn suggest_env_setup_commands(
    _script_path: &Path,
    missing_items: &[String],
) -> Result<Vec<EnvSetupCommand>, EnvCheckError> {
    if missing_items.is_empty() {
        return Ok(Vec::new());
    }

    Ok(suggest_env_setup_commands_for_platform(
        missing_items,
        current_platform(),
    ))
}

pub fn load_script_runtime_context(script_path: &Path) -> Result<ScriptRuntimeContext, EnvCheckError> {
    let content = fs::read_to_string(script_path).map_err(|error| {
        EnvCheckError::new(format!("Failed to read script {}: {error}", script_path.display()))
    })?;

    build_script_runtime_context(script_path, &content)
}

pub(crate) fn check_script_env_with_resolver(
    script_path: &Path,
    content: &str,
    command_exists: &impl Fn(&str) -> bool,
) -> Result<EnvCheckResult, EnvCheckError> {
    let context = build_script_runtime_context(script_path, content)?;
    let permission_problem = detect_permission_problem(script_path, &context.runtime_command);
    let permission_ok = permission_problem.is_none();
    let platform_problem = detect_platform_problem(context.meta.as_ref(), current_platform());
    let platform_ok = platform_problem.is_none();
    let runtime_ok = command_exists(&context.runtime_command);
    let deps = context
        .meta
        .as_ref()
        .map(|meta| meta.deps.clone())
        .unwrap_or_default();
    let missing_deps = deps
        .into_iter()
        .filter(|item| !command_exists(item))
        .collect::<Vec<_>>();
    let deps_ok = missing_deps.is_empty();

    let mut missing_items = Vec::new();
    if !runtime_ok {
        missing_items.push(context.runtime_command.clone());
    }
    missing_items.extend(missing_deps.clone());

    let message = if permission_ok && platform_ok && runtime_ok && deps_ok {
        Some("Ready to run.".to_string())
    } else {
        Some(build_failure_message(
            permission_problem.as_deref(),
            platform_problem.as_deref(),
            runtime_ok,
            &context.runtime_command,
            &missing_deps,
        ))
    };

    Ok(EnvCheckResult {
        ok: permission_ok && platform_ok && runtime_ok && deps_ok,
        permission_ok,
        runtime_ok,
        deps_ok,
        missing_items,
        message,
    })
}

pub(crate) fn suggest_env_setup_commands_for_platform(
    missing_items: &[String],
    platform: PlatformKind,
) -> Vec<EnvSetupCommand> {
    missing_items
        .iter()
        .map(|item| map_env_command(item, platform))
        .collect()
}

fn build_script_runtime_context(
    script_path: &Path,
    content: &str,
) -> Result<ScriptRuntimeContext, EnvCheckError> {
    let runtime_command = detect_runtime_command(script_path, content).ok_or_else(|| {
        EnvCheckError::new(format!(
            "Unsupported script runtime for {}",
            script_path.display()
        ))
    })?;

    Ok(ScriptRuntimeContext {
        runtime_command,
        meta: parse_script_meta(content),
    })
}

fn detect_runtime_command(script_path: &Path, content: &str) -> Option<String> {
    let extension = script_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let first_line = content.lines().next().unwrap_or_default().trim().to_ascii_lowercase();

    if first_line.starts_with("#!") {
        if first_line.contains("python") {
            return Some("python3".to_string());
        }

        if first_line.contains("node") {
            return Some("node".to_string());
        }

        if first_line.contains("zsh") {
            return Some("zsh".to_string());
        }

        if first_line.contains("bash") {
            return Some("bash".to_string());
        }

        if first_line.contains("sh") {
            return Some("sh".to_string());
        }
    }

    match extension.as_str() {
        "py" => Some("python3".to_string()),
        "sh" => Some("sh".to_string()),
        "bash" => Some("bash".to_string()),
        "zsh" => Some("zsh".to_string()),
        "js" | "mjs" | "cjs" => Some("node".to_string()),
        _ => None,
    }
}

fn build_failure_message(
    permission_problem: Option<&str>,
    platform_problem: Option<&str>,
    runtime_ok: bool,
    runtime_command: &str,
    missing_deps: &[String],
) -> String {
    let mut problems = Vec::new();

    if let Some(problem) = permission_problem {
        problems.push(problem.to_string());
    }

    if let Some(problem) = platform_problem {
        problems.push(problem.to_string());
    }

    if !runtime_ok {
        problems.push(format!("Missing runtime {runtime_command}."));
    }

    if !missing_deps.is_empty() {
        problems.push(format!("Missing dependencies: {}.", missing_deps.join(", ")));
    }

    problems.join(" ")
}

fn detect_permission_problem(script_path: &Path, runtime_command: &str) -> Option<String> {
    if fs::File::open(script_path).is_err() {
        return Some("Script file is not readable.".to_string());
    }

    if is_shell_runtime(runtime_command) && !script_is_executable(script_path) {
        return Some("Shell script is not executable.".to_string());
    }

    None
}

fn detect_platform_problem(meta: Option<&ScriptMeta>, current_platform: PlatformKind) -> Option<String> {
    let Some(declared_platforms) = meta.and_then(|value| value.platform.as_deref()) else {
        return None;
    };

    if platform_matches(declared_platforms, current_platform) {
        return None;
    }

    Some(format!(
        "Script metadata does not support {}.",
        platform_label(current_platform)
    ))
}

fn current_platform() -> PlatformKind {
    if cfg!(target_os = "macos") {
        PlatformKind::Macos
    } else if cfg!(target_os = "windows") {
        PlatformKind::Windows
    } else {
        PlatformKind::Linux
    }
}

fn command_exists(command: &str) -> bool {
    if command.contains(std::path::MAIN_SEPARATOR) {
        return Path::new(command).is_file();
    }

    let Some(path_var) = env::var_os("PATH") else {
        return false;
    };

    let suffixes = executable_suffixes(command);

    env::split_paths(&path_var).any(|directory| {
        suffixes.iter().any(|suffix| {
            let candidate = build_candidate_path(&directory, command, suffix);
            candidate.is_file()
        })
    })
}

fn executable_suffixes(command: &str) -> Vec<OsString> {
    if cfg!(windows) && Path::new(command).extension().is_none() {
        let pathext = env::var_os("PATHEXT").unwrap_or_else(|| OsString::from(".EXE;.CMD;.BAT"));
        return pathext
            .to_string_lossy()
            .split(';')
            .filter(|segment| !segment.is_empty())
            .map(OsString::from)
            .collect();
    }

    vec![OsString::new()]
}

fn build_candidate_path(directory: &Path, command: &str, suffix: &OsString) -> PathBuf {
    if suffix.is_empty() {
        return directory.join(command);
    }

    directory.join(format!("{command}{}", suffix.to_string_lossy()))
}

fn is_shell_runtime(runtime_command: &str) -> bool {
    matches!(runtime_command, "sh" | "bash" | "zsh")
}

#[cfg(unix)]
fn script_is_executable(script_path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    fs::metadata(script_path)
        .map(|metadata| metadata.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn script_is_executable(_script_path: &Path) -> bool {
    true
}

fn platform_matches(declared_platforms: &str, current_platform: PlatformKind) -> bool {
    declared_platforms
        .split(|character: char| character == ',' || character == '|' || character.is_whitespace())
        .filter(|segment| !segment.is_empty())
        .map(|segment| segment.trim().to_ascii_lowercase())
        .any(|segment| {
            if matches!(segment.as_str(), "any" | "all" | "*") {
                return true;
            }

            match current_platform {
                PlatformKind::Macos => matches!(segment.as_str(), "macos" | "mac" | "darwin"),
                PlatformKind::Linux => matches!(segment.as_str(), "linux"),
                PlatformKind::Windows => matches!(segment.as_str(), "windows" | "win" | "win32"),
            }
        })
}

fn platform_label(platform: PlatformKind) -> &'static str {
    match platform {
        PlatformKind::Macos => "macOS",
        PlatformKind::Linux => "Linux",
        PlatformKind::Windows => "Windows",
    }
}

fn map_env_command(item: &str, platform: PlatformKind) -> EnvSetupCommand {
    match platform {
        PlatformKind::Macos => match normalize_missing_item(item).as_str() {
            "python3" | "python" => command_hint("Install python", "brew install python", false),
            "node" | "nodejs" => command_hint("Install node", "brew install node", false),
            "bash" => command_hint("Install bash", "brew install bash", false),
            "zsh" => command_hint("Install zsh", "brew install zsh", false),
            other => command_hint(
                &format!("Install {other}"),
                &format!("brew install {other}"),
                false,
            ),
        },
        PlatformKind::Linux => match normalize_missing_item(item).as_str() {
            "python3" | "python" => {
                command_hint("Install python3", "sudo apt-get install -y python3", true)
            }
            "node" | "nodejs" => {
                command_hint("Install nodejs", "sudo apt-get install -y nodejs", true)
            }
            "bash" => command_hint("Install bash", "sudo apt-get install -y bash", true),
            "zsh" => command_hint("Install zsh", "sudo apt-get install -y zsh", true),
            other => command_hint(
                &format!("Install {other}"),
                &format!("sudo apt-get install -y {other}"),
                true,
            ),
        },
        PlatformKind::Windows => match normalize_missing_item(item).as_str() {
            "python3" | "python" => {
                command_hint("Install python", "winget install Python.Python.3", false)
            }
            "node" | "nodejs" => {
                command_hint("Install node", "winget install OpenJS.NodeJS.LTS", false)
            }
            "ffmpeg" => command_hint("Install ffmpeg", "winget install Gyan.FFmpeg", false),
            other => command_hint(
                &format!("Install {other}"),
                &format!("winget install {other}"),
                false,
            ),
        },
    }
}

fn normalize_missing_item(item: &str) -> String {
    item.trim().to_ascii_lowercase()
}

fn command_hint(title: &str, command: &str, requires_privilege: bool) -> EnvSetupCommand {
    EnvSetupCommand {
        title: title.to_string(),
        command: command.to_string(),
        requires_privilege: if requires_privilege { Some(true) } else { None },
        note: None,
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    use tempfile::tempdir;

    use super::*;

    #[test]
    fn check_script_env_reports_missing_runtime_and_dependencies() {
        let result = check_script_env_with_resolver(
            Path::new("/tmp/demo.py"),
            "#!/usr/bin/env python3\n# @sm:dep ffmpeg\nprint('ok')\n",
            &|command| command != "python3" && command != "ffmpeg",
        )
        .unwrap();

        assert!(!result.ok);
        assert!(!result.runtime_ok);
        assert!(!result.deps_ok);
        assert_eq!(result.missing_items, vec!["python3", "ffmpeg"]);
    }

    #[test]
    fn suggest_env_setup_commands_returns_platform_specific_commands() {
        let commands = suggest_env_setup_commands_for_platform(
            &["ffmpeg".to_string(), "python3".to_string()],
            PlatformKind::Macos,
        );

        assert_eq!(commands.len(), 2);
        assert_eq!(commands[0].command, "brew install ffmpeg");
        assert_eq!(commands[1].command, "brew install python");
    }

    #[test]
    fn check_script_env_fails_when_platform_metadata_excludes_current_os() {
        let current = match current_platform() {
            PlatformKind::Macos => "linux",
            PlatformKind::Linux => "windows",
            PlatformKind::Windows => "macos",
        };
        let temp_dir = tempdir().unwrap();
        let script_path = temp_dir.path().join("demo.py");
        let content =
            format!("#!/usr/bin/env python3\n# @sm:platform {current}\nprint('ok')\n");
        fs::write(&script_path, &content).unwrap();

        let result =
            check_script_env_with_resolver(&script_path, &content, &|command| command == "python3")
                .unwrap();

        assert!(!result.ok);
        assert!(result.permission_ok);
        assert!(result.runtime_ok);
        assert!(result.deps_ok);
        assert!(result.missing_items.is_empty());
        assert!(
            result
                .message
                .as_deref()
                .unwrap_or_default()
                .contains("does not support")
        );
    }

    #[cfg(unix)]
    #[test]
    fn check_script_env_fails_for_non_executable_shell_scripts() {
        use std::os::unix::fs::PermissionsExt;

        let temp_dir = tempdir().unwrap();
        let script_path = temp_dir.path().join("demo.sh");
        let content = "#!/bin/sh\necho ok\n";
        fs::write(&script_path, content).unwrap();

        let mut permissions = fs::metadata(&script_path).unwrap().permissions();
        permissions.set_mode(0o644);
        fs::set_permissions(&script_path, permissions).unwrap();

        let result = check_script_env_with_resolver(&script_path, content, &|command| {
            command == "sh"
        })
        .unwrap();

        assert!(!result.ok);
        assert!(!result.permission_ok);
        assert!(result.runtime_ok);
        assert!(result.deps_ok);
        assert!(
            result
                .message
                .as_deref()
                .unwrap_or_default()
                .contains("not executable")
        );
    }
}
