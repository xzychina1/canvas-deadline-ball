mod deadlines;

use tauri::Manager;

fn cfg_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

// 聚合所有启用源的未来作业(首次会把旧 feed_url.txt 迁移成 config.json)
#[tauri::command]
fn get_deadlines(app: tauri::AppHandle) -> Result<Vec<deadlines::Deadline>, String> {
    let dir = cfg_dir(&app)?;
    Ok(deadlines::aggregate(&deadlines::load_config_from(&dir)))
}

#[tauri::command]
fn get_config(app: tauri::AppHandle) -> Result<deadlines::Config, String> {
    let dir = cfg_dir(&app)?;
    Ok(deadlines::load_config_from(&dir))
}

#[tauri::command]
fn save_config(app: tauri::AppHandle, config: deadlines::Config) -> Result<(), String> {
    let dir = cfg_dir(&app)?;
    deadlines::save_config_to(&dir, &config)
}

// 设置面板用:试拉一个源,返回解析到的事件数
#[tauri::command]
fn test_source(url: String, kind: String) -> Result<usize, String> {
    deadlines::test_source(&url, &kind)
}

// 用默认浏览器打开作业链接
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
        .invoke_handler(tauri::generate_handler![
            get_deadlines,
            get_config,
            save_config,
            test_source,
            open_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
