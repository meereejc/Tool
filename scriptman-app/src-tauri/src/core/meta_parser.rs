use crate::core::types::{ParamDef, ScriptMeta};

pub fn parse_script_meta(content: &str) -> Option<ScriptMeta> {
    let mut meta = ScriptMeta::default();
    let mut block_started = false;
    let mut parsed_any = false;
    let mut defaults = Vec::new();

    for (index, raw_line) in content.lines().take(50).enumerate() {
        let trimmed = raw_line.trim();

        if index == 0 && trimmed.starts_with("#!") {
            continue;
        }

        if block_started && trimmed.is_empty() {
            break;
        }

        let comment = match strip_comment_prefix(trimmed) {
            Some(comment) => comment,
            None => {
                if block_started || !trimmed.is_empty() {
                    break;
                }
                continue;
            }
        };

        if let Some(payload) = comment.strip_prefix("@sm:") {
            block_started = true;

            let Some((raw_key, raw_value)) = payload.split_once(char::is_whitespace) else {
                continue;
            };

            let key = raw_key.trim().to_ascii_lowercase();
            let value = raw_value.trim();
            if value.is_empty() {
                continue;
            }

            match key.as_str() {
                "name" => {
                    meta.name = Some(value.to_string());
                    parsed_any = true;
                }
                "category" => {
                    meta.category = Some(value.to_string());
                    parsed_any = true;
                }
                "desc" => {
                    meta.desc = Some(value.to_string());
                    parsed_any = true;
                }
                "platform" => {
                    meta.platform = Some(value.to_string());
                    parsed_any = true;
                }
                "runtime" => {
                    meta.runtime = Some(value.to_string());
                    parsed_any = true;
                }
                "dep" => {
                    meta.deps.push(value.to_string());
                    parsed_any = true;
                }
                "input" => {
                    if meta.input_hint.is_none() {
                        meta.input_hint = Some(value.to_string());
                    }
                    parsed_any = true;
                }
                "output" => {
                    if meta.output_hint.is_none() {
                        meta.output_hint = Some(value.to_string());
                    }
                    parsed_any = true;
                }
                "param" => {
                    if let Some(param) = parse_param(value) {
                        meta.params.push(param);
                        parsed_any = true;
                    }
                }
                "default" => {
                    if let Some((name, default_value)) = parse_default(value) {
                        defaults.push((name, default_value));
                    }
                }
                _ => {}
            }

            continue;
        }

        if block_started {
            continue;
        }
    }

    if !parsed_any {
        return None;
    }

    for (name, default_value) in defaults {
        if let Some(param) = meta.params.iter_mut().find(|param| param.name == name) {
            param.default_value = Some(default_value);
        }
    }

    Some(meta)
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

fn parse_param(value: &str) -> Option<ParamDef> {
    let segments: Vec<_> = value.split('|').map(|segment| segment.trim()).collect();
    if segments.len() != 4 || segments.iter().any(|segment| segment.is_empty()) {
        return None;
    }

    let required = match segments[2].to_ascii_lowercase().as_str() {
        "required" | "true" => true,
        "optional" | "false" => false,
        _ => return None,
    };

    Some(ParamDef {
        name: segments[0].to_string(),
        value_type: segments[1].to_string(),
        required,
        description: segments[3].to_string(),
        default_value: None,
    })
}

fn parse_default(value: &str) -> Option<(String, String)> {
    let segments: Vec<_> = value.split('|').map(|segment| segment.trim()).collect();
    if segments.len() != 2 || segments.iter().any(|segment| segment.is_empty()) {
        return None;
    }

    Some((segments[0].to_string(), segments[1].to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_first_valid_sm_block_after_shebang() {
        let content = r#"#!/usr/bin/env python3
# @sm:name Demo
# @sm:desc Example
# @sm:param --input | path | required | Input directory
# @sm:default --input | /tmp/in
print("ok")
"#;

        let parsed = parse_script_meta(content).unwrap();

        assert_eq!(parsed.name.as_deref(), Some("Demo"));
        assert_eq!(parsed.desc.as_deref(), Some("Example"));
        assert_eq!(parsed.params.len(), 1);
        assert_eq!(parsed.params[0].default_value.as_deref(), Some("/tmp/in"));
    }

    #[test]
    fn ignores_second_sm_block_and_invalid_default_binding() {
        let content = r#"# @sm:name First
# @sm:default --missing | 1
# comment
print("body")
# @sm:name Second
"#;

        let parsed = parse_script_meta(content).unwrap();

        assert_eq!(parsed.name.as_deref(), Some("First"));
    }
}
