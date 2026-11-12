use base64::Engine;
use tauri_plugin_dialog::DialogExt;

/// Saves a file the page made (an exported figure, a project): asks where with
/// the system's Save dialog, then writes it there. The web view can't download
/// a file by itself. Returns the path, or None when the dialog was cancelled.
#[tauri::command]
async fn save_file(app: tauri::AppHandle, name: String, data: String) -> Result<Option<String>, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|e| e.to_string())?;
    let mut dialog = app.dialog().file().set_file_name(&name);
    if let Some(ext) = std::path::Path::new(&name).extension().and_then(|e| e.to_str()) {
        dialog = dialog.add_filter(ext.to_uppercase(), &[ext]);
    }
    let Some(path) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.display().to_string()))
}

/// The desktop app is the web app in a native window: every file ships inside
/// the app and nothing is fetched. The one native command saves files the user
/// exports, through the system's Save dialog.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_file])
        .run(tauri::generate_context!())
        .expect("the Curvelet window could not start");
}
