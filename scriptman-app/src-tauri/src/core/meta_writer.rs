use std::fs;
use std::path::Path;

use crate::core::types::ScriptMeta;

#[derive(Debug)]
pub enum MetaWriteError {
    Io(std::io::Error),
    Validation(String),
}

impl std::fmt::Display for MetaWriteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "{error}"),
            Self::Validation(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for MetaWriteError {}

impl From<std::io::Error> for MetaWriteError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

pub fn write_script_meta(path: &Path, meta: &ScriptMeta) -> Result<(), MetaWriteError> {
    let content = fs::read_to_string(path)?;
    let comment_prefix = detect_comment_prefix(path, &content);
    let meta_lines = render_meta_lines(comment_prefix, meta)?;
    let updated = replace_or_insert_meta_block(&content, &meta_lines);

    fs::write(path, updated)?;
    Ok(())
}

fn detect_comment_prefix(path: &Path, content: &str) -> &'static str {
    let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or_default();

    match extension {
        "js" | "mjs" | "cjs" => "//",
        "py" | "sh" | "bash" | "zsh" => "#",
        _ => {
            let first_line = content.lines().next().unwrap_or_default().to_ascii_lowercase();
            if first_line.starts_with("#!") && first_line.contains("node") {
                "//"
            } else {
                "#"
            }
        }
    }
}

fn render_meta_lines(prefix: &str, meta: &ScriptMeta) -> Result<Vec<String>, MetaWriteError> {
    let mut lines = Vec::new();

    push_meta_line(&mut lines, prefix, "name", meta.name.as_deref());
    push_meta_line(&mut lines, prefix, "category", meta.category.as_deref());
    push_meta_line(&mut lines, prefix, "desc", meta.desc.as_deref());
    push_meta_line(&mut lines, prefix, "platform", meta.platform.as_deref());
    push_meta_line(&mut lines, prefix, "runtime", meta.runtime.as_deref());

    for dep in &meta.deps {
        push_meta_line(&mut lines, prefix, "dep", Some(dep));
    }

    if lines.is_empty() {
        return Err(MetaWriteError::Validation(
            "At least one metadata field is required.".into(),
        ));
    }

    Ok(lines)
}

fn push_meta_line(lines: &mut Vec<String>, prefix: &str, key: &str, value: Option<&str>) {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };

    lines.push(format!("{prefix} @sm:{key} {value}"));
}

fn replace_or_insert_meta_block(content: &str, meta_lines: &[String]) -> String {
    let mut lines = content
        .lines()
        .map(ToString::to_string)
        .collect::<Vec<String>>();
    let insert_index = if lines
        .first()
        .map(|line| line.trim_start().starts_with("#!"))
        .unwrap_or(false)
    {
        1
    } else {
        0
    };

    // Replace only the first header block so we preserve the body and any later
    // non-header comments exactly as they were.
    if let Some((start, end)) = find_existing_meta_block(&lines, insert_index) {
        lines.splice(start..end, meta_lines.iter().cloned());
    } else {
        lines.splice(insert_index..insert_index, meta_lines.iter().cloned());
    }

    let mut updated = lines.join("\n");
    if !updated.ends_with('\n') {
        updated.push('\n');
    }
    updated
}

fn find_existing_meta_block(lines: &[String], insert_index: usize) -> Option<(usize, usize)> {
    let mut index = insert_index;

    while index < lines.len() && lines[index].trim().is_empty() {
        index += 1;
    }

    if index >= lines.len() || !is_sm_comment_line(lines[index].trim()) {
        return None;
    }

    let start = index;
    while index < lines.len() {
        let trimmed = lines[index].trim();

        if trimmed.is_empty() {
            break;
        }

        if strip_comment_prefix(trimmed).is_some() {
            index += 1;
            continue;
        }

        break;
    }

    Some((start, index))
}

fn is_sm_comment_line(line: &str) -> bool {
    strip_comment_prefix(line)
        .map(|payload| payload.starts_with("@sm:"))
        .unwrap_or(false)
}

fn strip_comment_prefix(line: &str) -> Option<&str> {
    if let Some(stripped) = line.strip_prefix("//") {
        return Some(stripped.trim_start());
    }

    if let Some(stripped) = line.strip_prefix('#') {
        return Some(stripped.trim_start());
    }

    None
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::*;

    #[test]
    fn inserts_minimal_meta_block_after_shebang() {
        let root = tempdir().unwrap();
        let path = root.path().join("pending.py");
        let meta = ScriptMeta {
            name: Some("Pending Script".into()),
            category: Some("utility".into()),
            desc: Some("Adds metadata.".into()),
            platform: Some("macos".into()),
            runtime: Some("python3".into()),
            deps: vec!["ffmpeg".into(), "git".into()],
            ..ScriptMeta::default()
        };

        fs::write(
            &path,
            "#!/usr/bin/env python3\nprint(\"ok\")\n",
        )
        .unwrap();

        write_script_meta(&path, &meta).unwrap();

        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "#!/usr/bin/env python3\n# @sm:name Pending Script\n# @sm:category utility\n# @sm:desc Adds metadata.\n# @sm:platform macos\n# @sm:runtime python3\n# @sm:dep ffmpeg\n# @sm:dep git\nprint(\"ok\")\n"
        );
    }

    #[test]
    fn replaces_existing_meta_block_without_touching_body() {
        let root = tempdir().unwrap();
        let path = root.path().join("pending.js");
        let meta = ScriptMeta {
            name: Some("Bundler".into()),
            desc: Some("Bundles the assets.".into()),
            runtime: Some("node".into()),
            deps: vec!["pnpm".into()],
            ..ScriptMeta::default()
        };

        fs::write(
            &path,
            "#!/usr/bin/env node\n// @sm:name Old Script\n// @sm:desc Old copy\nconsole.log(\"ok\")\n",
        )
        .unwrap();

        write_script_meta(&path, &meta).unwrap();

        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "#!/usr/bin/env node\n// @sm:name Bundler\n// @sm:desc Bundles the assets.\n// @sm:runtime node\n// @sm:dep pnpm\nconsole.log(\"ok\")\n"
        );
    }
}
