use std::fs;
use std::path::PathBuf;

use crate::core::types::AppConfig;

#[derive(Debug)]
pub enum ConfigStoreError {
    Io(std::io::Error),
    Serde(serde_json::Error),
}

impl std::fmt::Display for ConfigStoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "config io error: {error}"),
            Self::Serde(error) => write!(f, "config serde error: {error}"),
        }
    }
}

impl std::error::Error for ConfigStoreError {}

impl From<std::io::Error> for ConfigStoreError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<serde_json::Error> for ConfigStoreError {
    fn from(value: serde_json::Error) -> Self {
        Self::Serde(value)
    }
}

pub struct ConfigStore {
    base_dir: PathBuf,
}

impl ConfigStore {
    pub fn new(base_dir: PathBuf) -> Self {
        Self { base_dir }
    }

    pub fn load(&self) -> Result<AppConfig, ConfigStoreError> {
        let config_path = self.config_path();
        if !config_path.exists() {
            return Ok(AppConfig::default());
        }

        let content = fs::read_to_string(config_path)?;
        Ok(serde_json::from_str(&content)?)
    }

    pub fn save(&self, config: &AppConfig) -> Result<(), ConfigStoreError> {
        fs::create_dir_all(&self.base_dir)?;
        let content = serde_json::to_string_pretty(config)?;
        fs::write(self.config_path(), content)?;
        Ok(())
    }

    fn config_path(&self) -> PathBuf {
        self.base_dir.join("config.json")
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use tempfile::tempdir;

    use super::*;

    #[test]
    fn load_returns_default_when_config_is_missing() {
        let dir = tempdir().unwrap();
        let store = ConfigStore::new(dir.path().to_path_buf());

        let config = store.load().unwrap();

        assert!(config.watch_paths.is_empty());
        assert_eq!(config.default_cwd, None);
        assert!(!config.scan_loose_mode);
    }

    #[test]
    fn save_then_load_round_trips_config() {
        let dir = tempdir().unwrap();
        let store = ConfigStore::new(dir.path().to_path_buf());
        let config = AppConfig {
            watch_paths: vec!["/tmp/scripts".into()],
            ..AppConfig::default()
        };

        store.save(&config).unwrap();

        assert_eq!(store.load().unwrap().watch_paths, vec!["/tmp/scripts"]);
    }

    #[test]
    fn load_discards_legacy_config_fields_when_rewriting_into_current_model() {
        let dir = tempdir().unwrap();
        let store = ConfigStore::new(dir.path().to_path_buf());

        fs::write(
            dir.path().join("config.json"),
            serde_json::to_string_pretty(&json!({
                "watchPaths": ["/tmp/scripts"],
                "defaultCwd": "/tmp/work",
                "scanLooseMode": true,
                "theme": "system",
                "offlineMode": false,
                "aiProvider": "openai",
                "aiModel": "gpt-5.4",
                "aiBaseUrl": "https://api.example.com"
            }))
            .unwrap(),
        )
        .unwrap();

        let config = store.load().unwrap();

        assert_eq!(
            serde_json::to_value(&config).unwrap(),
            json!({
                "watchPaths": ["/tmp/scripts"],
                "defaultCwd": "/tmp/work",
                "scanLooseMode": true
            })
        );
    }
}
