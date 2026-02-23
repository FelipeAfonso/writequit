//! File-based storage for writequit desktop.
//!
//! Data layout (XDG compliant):
//!
//! ```text
//! ~/.local/share/writequit/
//! ├── tasks/               # One .md file per task
//! │   ├── fix-auth-bug.md
//! │   └── add-dark-mode.md
//! ├── sessions.ledger      # Chronological session log
//! └── invoices/            # One .yaml per invoice
//!     └── INV-2026-001.yaml
//!
//! ~/.config/writequit/
//! ├── tags.yaml            # Tag definitions
//! └── settings.yaml        # User preferences
//! ```

use std::fs;
use std::path::{Path, PathBuf};

pub struct StorageManager {
    data_dir: PathBuf,
    config_dir: PathBuf,
}

impl StorageManager {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let data_dir = dirs::data_dir()
            .ok_or("Could not determine XDG data directory")?
            .join("writequit");

        let config_dir = dirs::config_dir()
            .ok_or("Could not determine XDG config directory")?
            .join("writequit");

        // Ensure directories exist
        fs::create_dir_all(data_dir.join("tasks"))?;
        fs::create_dir_all(data_dir.join("invoices"))?;
        fs::create_dir_all(&config_dir)?;

        // Create default files if they don't exist
        let sessions_path = data_dir.join("sessions.ledger");
        if !sessions_path.exists() {
            fs::write(&sessions_path, "; writequit session ledger\n")?;
        }

        let tags_path = config_dir.join("tags.yaml");
        if !tags_path.exists() {
            fs::write(&tags_path, "# writequit tag definitions\n")?;
        }

        let settings_path = config_dir.join("settings.yaml");
        if !settings_path.exists() {
            fs::write(
                &settings_path,
                "# writequit user settings\nvim_mode: true\ntimezone: \"\"\ndefault_status_filter: active\ndefault_tag_filter: all\n",
            )?;
        }

        Ok(Self {
            data_dir,
            config_dir,
        })
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub fn config_dir(&self) -> &Path {
        &self.config_dir
    }

    // ── Tasks ──────────────────────────────────────────────────────

    pub fn list_tasks(&self) -> Result<Vec<String>, Box<dyn std::error::Error>> {
        let tasks_dir = self.data_dir.join("tasks");
        let mut slugs = Vec::new();

        if tasks_dir.exists() {
            for entry in fs::read_dir(&tasks_dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("md") {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        slugs.push(stem.to_string());
                    }
                }
            }
        }

        slugs.sort();
        Ok(slugs)
    }

    pub fn read_task(&self, slug: &str) -> Result<String, Box<dyn std::error::Error>> {
        let path = self.data_dir.join("tasks").join(format!("{}.md", slug));
        Ok(fs::read_to_string(path)?)
    }

    pub fn write_task(&self, slug: &str, content: &str) -> Result<(), Box<dyn std::error::Error>> {
        let path = self.data_dir.join("tasks").join(format!("{}.md", slug));
        Ok(fs::write(path, content)?)
    }

    pub fn delete_task(&self, slug: &str) -> Result<(), Box<dyn std::error::Error>> {
        let path = self.data_dir.join("tasks").join(format!("{}.md", slug));
        if path.exists() {
            fs::remove_file(path)?;
        }
        Ok(())
    }

    pub fn rename_task(
        &self,
        old_slug: &str,
        new_slug: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let old_path = self.data_dir.join("tasks").join(format!("{}.md", old_slug));
        let new_path = self.data_dir.join("tasks").join(format!("{}.md", new_slug));

        if old_path.exists() {
            fs::rename(old_path, new_path)?;
        }
        Ok(())
    }

    // ── Sessions ───────────────────────────────────────────────────

    pub fn read_sessions(&self) -> Result<String, Box<dyn std::error::Error>> {
        let path = self.data_dir.join("sessions.ledger");
        Ok(fs::read_to_string(path)?)
    }

    pub fn write_sessions(&self, content: &str) -> Result<(), Box<dyn std::error::Error>> {
        let path = self.data_dir.join("sessions.ledger");
        Ok(fs::write(path, content)?)
    }

    // ── Tags ───────────────────────────────────────────────────────

    pub fn read_tags(&self) -> Result<String, Box<dyn std::error::Error>> {
        let path = self.config_dir.join("tags.yaml");
        Ok(fs::read_to_string(path)?)
    }

    pub fn write_tags(&self, content: &str) -> Result<(), Box<dyn std::error::Error>> {
        let path = self.config_dir.join("tags.yaml");
        Ok(fs::write(path, content)?)
    }

    // ── Settings ───────────────────────────────────────────────────

    pub fn read_settings(&self) -> Result<String, Box<dyn std::error::Error>> {
        let path = self.config_dir.join("settings.yaml");
        Ok(fs::read_to_string(path)?)
    }

    pub fn write_settings(&self, content: &str) -> Result<(), Box<dyn std::error::Error>> {
        let path = self.config_dir.join("settings.yaml");
        Ok(fs::write(path, content)?)
    }

    // ── Invoices ───────────────────────────────────────────────────

    pub fn list_invoices(&self) -> Result<Vec<String>, Box<dyn std::error::Error>> {
        let invoices_dir = self.data_dir.join("invoices");
        let mut names = Vec::new();

        if invoices_dir.exists() {
            for entry in fs::read_dir(&invoices_dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("yaml") {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        names.push(stem.to_string());
                    }
                }
            }
        }

        names.sort();
        Ok(names)
    }

    pub fn read_invoice(&self, name: &str) -> Result<String, Box<dyn std::error::Error>> {
        let path = self
            .data_dir
            .join("invoices")
            .join(format!("{}.yaml", name));
        Ok(fs::read_to_string(path)?)
    }

    pub fn write_invoice(
        &self,
        name: &str,
        content: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let path = self
            .data_dir
            .join("invoices")
            .join(format!("{}.yaml", name));
        Ok(fs::write(path, content)?)
    }

    pub fn delete_invoice(&self, name: &str) -> Result<(), Box<dyn std::error::Error>> {
        let path = self
            .data_dir
            .join("invoices")
            .join(format!("{}.yaml", name));
        if path.exists() {
            fs::remove_file(path)?;
        }
        Ok(())
    }
}
