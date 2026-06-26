mod deadlines;

use tauri::Manager;

// 从应用配置目录读取 ICS feed URL(密钥,不进代码库),拉取并解析未来 7 天的作业
#[tauri::command]
fn get_deadlines(app: tauri::AppHandle) -> Result<Vec<deadlines::Assignment>, String> {
    let result = (|| {
        let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
        let path = dir.join("feed_url.txt");
        let url = std::fs::read_to_string(&path)
            .map_err(|_| format!("未找到 feed_url.txt(应放在 {})", path.display()))?;
        let url = url.trim_start_matches('\u{feff}').trim();
        deadlines::fetch_and_parse(url)
    })();
    if let Err(e) = &result {
        eprintln!("[get_deadlines] error: {}", e);
    }
    result
}

// 用默认浏览器打开作业链接(回 Canvas)
#[tauri::command]
fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_deadlines, open_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
