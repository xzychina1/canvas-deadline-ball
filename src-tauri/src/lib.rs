mod deadlines;

use std::collections::HashSet;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

fn cfg_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

// 创建一个球窗口(透明/无边框/置顶/不可缩放/不进任务栏)
fn build_ball(app: &tauri::AppHandle, label: &str, x: f64, y: f64) -> Result<(), String> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .inner_size(100.0, 100.0)
        .position(x, y)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .resizable(false)
        .skip_taskbar(true)
        .shadow(false)
        .title("Canvas Deadline Ball")
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// 让窗口集合与配置一致:每个启用源一个球;无源时给一个 setup 窗口开设置
fn sync_windows(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = cfg_dir(app)?;
    let cfg = deadlines::load_config_from(&dir);
    let enabled: Vec<_> = cfg.sources.iter().filter(|s| s.enabled).collect();
    let desired: HashSet<String> = enabled.iter().map(|s| format!("ball::{}", s.id)).collect();

    // 关掉不再需要的球
    for (label, win) in app.webview_windows() {
        if label.starts_with("ball::") && !desired.contains(&label) {
            let _ = win.close();
        }
    }

    if enabled.is_empty() {
        if app.get_webview_window("setup").is_none() {
            build_ball(app, "setup", 200.0, 200.0)?;
        }
        return Ok(());
    }
    if let Some(w) = app.get_webview_window("setup") {
        let _ = w.close();
    }

    // 创建缺失的球(错开位置)
    for (i, s) in enabled.iter().enumerate() {
        let label = format!("ball::{}", s.id);
        if app.get_webview_window(&label).is_none() {
            build_ball(app, &label, 200.0 + i as f64 * 120.0, 200.0)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn get_source_deadlines(
    app: tauri::AppHandle,
    source_id: String,
) -> Result<Vec<deadlines::Deadline>, String> {
    let dir = cfg_dir(&app)?;
    Ok(deadlines::deadlines_for(&deadlines::load_config_from(&dir), &source_id))
}

#[tauri::command]
fn get_config(app: tauri::AppHandle) -> Result<deadlines::Config, String> {
    let dir = cfg_dir(&app)?;
    Ok(deadlines::load_config_from(&dir))
}

#[tauri::command]
fn save_config(app: tauri::AppHandle, config: deadlines::Config) -> Result<(), String> {
    let dir = cfg_dir(&app)?;
    deadlines::save_config_to(&dir, &config)?;
    // 只存盘 + 广播;窗口的增删交给前端(JS WebviewWindow),避免在 Windows 上从命令线程建窗冻死 UI
    let _ = app.emit("config-changed", ());
    Ok(())
}

#[tauri::command]
fn test_source(url: String, kind: String) -> Result<usize, String> {
    deadlines::test_source(&url, &kind)
}

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
            get_source_deadlines,
            get_config,
            save_config,
            test_source,
            open_url
        ])
        .setup(|app| {
            if let Err(e) = sync_windows(app.handle()) {
                eprintln!("sync_windows failed: {}", e);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
