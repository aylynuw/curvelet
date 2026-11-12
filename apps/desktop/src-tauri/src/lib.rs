/// The desktop app is the web app in a native window: every file ships inside
/// the app, nothing is fetched, and no native commands are exposed to the page.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("the Curvelet window could not start");
}
