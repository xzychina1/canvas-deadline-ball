mod deadlines;

use std::collections::{HashMap, HashSet};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

fn cfg_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

// 创建一个球窗口(透明/无边框/置顶/不可缩放/不进任务栏)
fn build_ball(app: &tauri::AppHandle, label: &str, x: f64, y: f64) -> Result<(), String> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .inner_size(130.0, 130.0)
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
    let cfg = deadlines::load_config_from(&dir);
    Ok(deadlines::deadlines_for(&cfg, &source_id, &load_completed(&app)))
}

// 已完成的 ddl(本地记录,按 ICS UID)
fn load_completed(app: &tauri::AppHandle) -> HashSet<String> {
    let Ok(dir) = cfg_dir(app) else {
        return HashSet::new();
    };
    std::fs::read_to_string(dir.join("completed.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<HashSet<String>>(&s).ok())
        .unwrap_or_default()
}

fn save_completed(app: &tauri::AppHandle, set: &HashSet<String>) -> Result<(), String> {
    let dir = cfg_dir(app)?;
    let json = serde_json::to_string_pretty(set).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("completed.json"), json).map_err(|e| e.to_string())
}

#[tauri::command]
fn mark_done(app: tauri::AppHandle, uid: String) -> Result<(), String> {
    let mut set = load_completed(&app);
    set.insert(uid);
    save_completed(&app, &set)
}

#[tauri::command]
fn unmark_done(app: tauri::AppHandle, uid: String) -> Result<(), String> {
    let mut set = load_completed(&app);
    set.remove(&uid);
    save_completed(&app, &set)
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

// 球的位置持久化(positions.json,按窗口标签存物理坐标)
#[tauri::command]
fn get_position(app: tauri::AppHandle, label: String) -> Option<[i32; 2]> {
    let dir = cfg_dir(&app).ok()?;
    let s = std::fs::read_to_string(dir.join("positions.json")).ok()?;
    let map: HashMap<String, [i32; 2]> = serde_json::from_str(&s).ok()?;
    map.get(&label).copied()
}

#[tauri::command]
fn save_position(app: tauri::AppHandle, label: String, x: i32, y: i32) -> Result<(), String> {
    let dir = cfg_dir(&app)?;
    let path = dir.join("positions.json");
    let mut map: HashMap<String, [i32; 2]> = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    map.insert(label, [x, y]);
    let json = serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

// ---------- Canvas 登录 + API(自动完成检测,实验) ----------

#[tauri::command]
async fn open_canvas_login(app: tauri::AppHandle, base_url: String) -> Result<(), String> {
    if app.get_webview_window("canvas-login").is_some() {
        return Ok(());
    }
    let url: tauri::Url = base_url.parse().map_err(|e| format!("bad url: {}", e))?;
    WebviewWindowBuilder::new(&app, "canvas-login", WebviewUrl::External(url))
        .title("Log in to Canvas")
        .inner_size(520.0, 720.0)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// 用 canvas-login 窗口的登录 cookie 调 Canvas API(async 避开 Windows 读 cookie 死锁)
#[tauri::command]
async fn canvas_api(
    app: tauri::AppHandle,
    base_url: String,
    path: String,
) -> Result<String, String> {
    let win = app
        .get_webview_window("canvas-login")
        .ok_or_else(|| "未登录:请先点「登录 Canvas」".to_string())?;
    let url: tauri::Url = base_url.parse().map_err(|e| format!("bad url: {}", e))?;
    let cookies = win.cookies_for_url(url).map_err(|e| e.to_string())?;
    if cookies.is_empty() {
        return Err("没读到 cookie——可能登录还没完成".to_string());
    }
    let cookie_header = cookies
        .iter()
        .map(|c| format!("{}={}", c.name(), c.value()))
        .collect::<Vec<_>>()
        .join("; ");
    let full = format!("{}{}", base_url.trim_end_matches('/'), path);
    let resp = minreq::get(full.as_str())
        .with_header("Cookie", cookie_header)
        .with_header("Accept", "application/json")
        .with_header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        )
        .send()
        .map_err(|e| e.to_string())?;
    resp.as_str().map(|s| s.to_string()).map_err(|e| e.to_string())
}

// 拉 planner items,把已提交/已评分/已标记完成的作业写进 completed.json(键 `assignment:<id>`)
#[tauri::command]
async fn canvas_sync_done(app: tauri::AppHandle, base_url: String) -> Result<usize, String> {
    let start = (chrono::Utc::now() - chrono::Duration::days(90))
        .format("%Y-%m-%d")
        .to_string();
    let path = format!("/api/v1/planner/items?per_page=100&start_date={}", start);
    let body = canvas_api(app.clone(), base_url, path).await?;
    let v: serde_json::Value = serde_json::from_str(&body).map_err(|e| {
        format!(
            "planner JSON 解析失败: {} (前 120 字: {})",
            e,
            body.chars().take(120).collect::<String>()
        )
    })?;
    let mut set = load_completed(&app);
    let mut n = 0usize;
    if let Some(arr) = v.as_array() {
        for item in arr {
            let submitted = item
                .pointer("/submissions/submitted")
                .and_then(|b| b.as_bool())
                .unwrap_or(false);
            let graded = item
                .pointer("/submissions/graded")
                .and_then(|b| b.as_bool())
                .unwrap_or(false);
            let marked = item
                .pointer("/planner_override/marked_complete")
                .and_then(|b| b.as_bool())
                .unwrap_or(false);
            if submitted || graded || marked {
                if let Some(id) = item.get("plannable_id").and_then(|x| x.as_i64()) {
                    if set.insert(format!("assignment:{}", id)) {
                        n += 1;
                    }
                }
            }
        }
    }
    save_completed(&app, &set)?;
    Ok(n)
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
            open_url,
            get_position,
            save_position,
            mark_done,
            unmark_done,
            open_canvas_login,
            canvas_api,
            canvas_sync_done
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
