mod storage;

use storage::StorageManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let storage = StorageManager::new()?;
            app.manage(storage);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Tasks
            cmd_list_tasks,
            cmd_read_task,
            cmd_write_task,
            cmd_delete_task,
            cmd_rename_task,
            // Sessions
            cmd_read_sessions,
            cmd_write_sessions,
            // Tags
            cmd_read_tags,
            cmd_write_tags,
            // Settings
            cmd_read_settings,
            cmd_write_settings,
            // Invoices
            cmd_list_invoices,
            cmd_read_invoice,
            cmd_write_invoice,
            cmd_delete_invoice,
            // Paths
            cmd_get_data_dir,
            cmd_get_config_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ── Task commands ──────────────────────────────────────────────────

#[tauri::command]
fn cmd_list_tasks(storage: tauri::State<StorageManager>) -> Result<Vec<String>, String> {
    storage.list_tasks().map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_read_task(storage: tauri::State<StorageManager>, slug: &str) -> Result<String, String> {
    storage.read_task(slug).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_write_task(
    storage: tauri::State<StorageManager>,
    slug: &str,
    content: &str,
) -> Result<(), String> {
    storage.write_task(slug, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_delete_task(storage: tauri::State<StorageManager>, slug: &str) -> Result<(), String> {
    storage.delete_task(slug).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_rename_task(
    storage: tauri::State<StorageManager>,
    old_slug: &str,
    new_slug: &str,
) -> Result<(), String> {
    storage
        .rename_task(old_slug, new_slug)
        .map_err(|e| e.to_string())
}

// ── Session commands ───────────────────────────────────────────────

#[tauri::command]
fn cmd_read_sessions(storage: tauri::State<StorageManager>) -> Result<String, String> {
    storage.read_sessions().map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_write_sessions(
    storage: tauri::State<StorageManager>,
    content: &str,
) -> Result<(), String> {
    storage
        .write_sessions(content)
        .map_err(|e| e.to_string())
}

// ── Tag commands ───────────────────────────────────────────────────

#[tauri::command]
fn cmd_read_tags(storage: tauri::State<StorageManager>) -> Result<String, String> {
    storage.read_tags().map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_write_tags(storage: tauri::State<StorageManager>, content: &str) -> Result<(), String> {
    storage.write_tags(content).map_err(|e| e.to_string())
}

// ── Settings commands ──────────────────────────────────────────────

#[tauri::command]
fn cmd_read_settings(storage: tauri::State<StorageManager>) -> Result<String, String> {
    storage.read_settings().map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_write_settings(
    storage: tauri::State<StorageManager>,
    content: &str,
) -> Result<(), String> {
    storage
        .write_settings(content)
        .map_err(|e| e.to_string())
}

// ── Invoice commands ───────────────────────────────────────────────

#[tauri::command]
fn cmd_list_invoices(storage: tauri::State<StorageManager>) -> Result<Vec<String>, String> {
    storage.list_invoices().map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_read_invoice(storage: tauri::State<StorageManager>, name: &str) -> Result<String, String> {
    storage.read_invoice(name).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_write_invoice(
    storage: tauri::State<StorageManager>,
    name: &str,
    content: &str,
) -> Result<(), String> {
    storage
        .write_invoice(name, content)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_delete_invoice(storage: tauri::State<StorageManager>, name: &str) -> Result<(), String> {
    storage
        .delete_invoice(name)
        .map_err(|e| e.to_string())
}

// ── Path commands ──────────────────────────────────────────────────

#[tauri::command]
fn cmd_get_data_dir(storage: tauri::State<StorageManager>) -> String {
    storage.data_dir().to_string_lossy().to_string()
}

#[tauri::command]
fn cmd_get_config_dir(storage: tauri::State<StorageManager>) -> String {
    storage.config_dir().to_string_lossy().to_string()
}
