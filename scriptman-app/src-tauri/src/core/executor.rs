use std::collections::{BTreeMap, HashMap};
use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::core::types::{ExecutionExitEvent, ExecutionLogEvent, RunScriptData};

#[derive(Debug)]
pub struct ExecutorError {
    message: String,
}

impl ExecutorError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for ExecutorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ExecutorError {}

impl From<std::io::Error> for ExecutorError {
    fn from(value: std::io::Error) -> Self {
        Self::new(format!("process io error: {value}"))
    }
}

#[derive(Debug, Default, Clone)]
pub struct ExecutionRegistry {
    processes: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
}

impl ExecutionRegistry {
    pub fn insert(&self, execution_id: String, child: Arc<Mutex<Child>>) {
        self.processes.lock().unwrap().insert(execution_id, child);
    }

    pub fn get(&self, execution_id: &str) -> Option<Arc<Mutex<Child>>> {
        self.processes.lock().unwrap().get(execution_id).cloned()
    }

    pub fn remove(&self, execution_id: &str) {
        self.processes.lock().unwrap().remove(execution_id);
    }
}

pub fn start_script_execution(
    app: AppHandle,
    registry: ExecutionRegistry,
    runtime_command: &str,
    script_path: &Path,
    args: &BTreeMap<String, Value>,
    cwd: &Path,
) -> Result<RunScriptData, ExecutorError> {
    let execution_id = generate_execution_id();
    let mut child = spawn_script_process(runtime_command, script_path, args, cwd)?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let shared_child = Arc::new(Mutex::new(child));

    registry.insert(execution_id.clone(), shared_child.clone());

    if let Some(stdout) = stdout {
        spawn_stream_thread(app.clone(), execution_id.clone(), "stdout", stdout);
    }

    if let Some(stderr) = stderr {
        spawn_stream_thread(app.clone(), execution_id.clone(), "stderr", stderr);
    }

    spawn_exit_watcher(app, execution_id.clone(), shared_child, registry);

    Ok(RunScriptData {
        execution_id,
        started: true,
    })
}

pub fn stop_execution(
    registry: &ExecutionRegistry,
    execution_id: &str,
) -> Result<bool, ExecutorError> {
    let Some(child) = registry.get(execution_id) else {
        return Ok(false);
    };

    let mut process = child.lock().unwrap();
    process.kill().map(|_| true).map_err(ExecutorError::from)
}

pub(crate) fn build_cli_args(args: &BTreeMap<String, Value>) -> Result<Vec<String>, ExecutorError> {
    let mut cli_args = Vec::new();

    for (name, value) in args {
        match value {
            Value::Bool(true) => cli_args.push(name.clone()),
            Value::Bool(false) | Value::Null => {}
            Value::String(text) => {
                if text.is_empty() {
                    continue;
                }

                cli_args.push(name.clone());
                cli_args.push(text.clone());
            }
            Value::Number(number) => {
                cli_args.push(name.clone());
                cli_args.push(number.to_string());
            }
            Value::Array(_) | Value::Object(_) => {
                return Err(ExecutorError::new(format!(
                    "Unsupported argument value for {name}"
                )));
            }
        }
    }

    Ok(cli_args)
}

pub(crate) fn spawn_script_process(
    runtime_command: &str,
    script_path: &Path,
    args: &BTreeMap<String, Value>,
    cwd: &Path,
) -> Result<Child, ExecutorError> {
    let cli_args = build_cli_args(args)?;

    let mut command = Command::new(runtime_command);
    command.arg(script_path);
    command.args(&cli_args);
    command.current_dir(cwd);
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    command.spawn().map_err(ExecutorError::from)
}

fn generate_execution_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("exec-{millis}")
}

fn spawn_stream_thread<R: Read + Send + 'static>(
    app: AppHandle,
    execution_id: String,
    stream: &str,
    reader: R,
) {
    let stream_name = stream.to_string();

    thread::spawn(move || {
        for line in BufReader::new(reader).lines() {
            let Ok(line) = line else {
                break;
            };

            let _ = app.emit(
                &format!("scriptman://execution/{stream_name}"),
                ExecutionLogEvent {
                    execution_id: execution_id.clone(),
                    stream: stream_name.clone(),
                    line,
                },
            );
        }
    });
}

fn spawn_exit_watcher(
    app: AppHandle,
    execution_id: String,
    child: Arc<Mutex<Child>>,
    registry: ExecutionRegistry,
) {
    thread::spawn(move || loop {
        let status = {
            let mut process = child.lock().unwrap();
            process.try_wait()
        };

        match status {
            Ok(Some(exit_status)) => {
                registry.remove(&execution_id);
                let _ = app.emit(
                    "scriptman://execution/exit",
                    ExecutionExitEvent {
                        execution_id: execution_id.clone(),
                        exit_code: exit_status.code(),
                        success: exit_status.success(),
                    },
                );
                break;
            }
            Ok(None) => thread::sleep(Duration::from_millis(120)),
            Err(error) => {
                registry.remove(&execution_id);
                let _ = app.emit(
                    "scriptman://execution/exit",
                    ExecutionExitEvent {
                        execution_id: execution_id.clone(),
                        exit_code: None,
                        success: false,
                    },
                );
                let _ = app.emit(
                    "scriptman://execution/stderr",
                    ExecutionLogEvent {
                        execution_id: execution_id.clone(),
                        stream: "stderr".to_string(),
                        line: format!("Failed to monitor process: {error}"),
                    },
                );
                break;
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::fs;

    use serde_json::json;
    use tempfile::tempdir;

    use super::*;

    #[test]
    fn build_cli_args_skips_false_booleans_and_formats_other_values() {
        let args = build_cli_args(&BTreeMap::from([
            ("--input".to_string(), json!("/tmp/in")),
            ("--verbose".to_string(), json!(true)),
            ("--dry-run".to_string(), json!(false)),
            ("--quality".to_string(), json!(92)),
        ]))
        .unwrap();

        assert_eq!(
            args,
            vec![
                "--input".to_string(),
                "/tmp/in".to_string(),
                "--quality".to_string(),
                "92".to_string(),
                "--verbose".to_string(),
            ]
        );
    }

    #[cfg(unix)]
    #[test]
    fn spawn_script_process_runs_a_real_script_with_built_arguments() {
        use std::os::unix::fs::PermissionsExt;

        let temp_dir = tempdir().unwrap();
        let script_path = temp_dir.path().join("echo-args.sh");
        fs::write(
            &script_path,
            "#!/bin/sh\nprintf '%s|%s|%s|%s|%s\\n' \"$1\" \"$2\" \"$3\" \"$4\" \"$5\"\n",
        )
        .unwrap();
        let mut permissions = fs::metadata(&script_path).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&script_path, permissions).unwrap();

        let child = spawn_script_process(
            "sh",
            &script_path,
            &BTreeMap::from([
                ("--input".to_string(), json!("/tmp/in")),
                ("--quality".to_string(), json!(92)),
                ("--verbose".to_string(), json!(true)),
            ]),
            temp_dir.path(),
        )
        .unwrap();
        let output = child.wait_with_output().unwrap();

        assert!(output.status.success());
        assert_eq!(
            String::from_utf8_lossy(&output.stdout).trim(),
            "--input|/tmp/in|--quality|92|--verbose"
        );
    }
}
