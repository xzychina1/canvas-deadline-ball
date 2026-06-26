use chrono::{DateTime, Local, NaiveDate, NaiveDateTime, TimeZone, Utc};
use ical::parser::ical::component::IcalEvent;
use serde::{Deserialize, Serialize};
use std::io::BufReader;
use std::path::Path;

// ---------- 配置模型 ----------

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub id: String,
    pub name: String,
    #[serde(default = "default_kind")]
    pub kind: String, // "canvas" | "ics"
    pub url: String,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_kind() -> String {
    "ics".to_string()
}
fn default_color() -> String {
    "#e23b3b".to_string()
}
fn default_true() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default)]
    pub sources: Vec<Source>,
    #[serde(default = "default_window")]
    pub window_days: i64,
    #[serde(default = "default_refresh")]
    pub refresh_minutes: u64,
}

fn default_window() -> i64 {
    7
}
fn default_refresh() -> u64 {
    30
}

impl Default for Config {
    fn default() -> Self {
        Config {
            sources: Vec::new(),
            window_days: 7,
            refresh_minutes: 30,
        }
    }
}

// ---------- 发给前端的一条 ddl ----------

#[derive(Serialize)]
pub struct Deadline {
    pub source: String,
    pub color: String,
    pub course: String,
    pub title: String,
    pub due: String, // 本地 "MM-DD HH:MM"
    pub url: String,
}

// 内部:带真实时间,用于排序/过滤
struct Raw {
    course: String,
    title: String,
    due: DateTime<Utc>,
    url: String,
}

// ---------- 配置读写(含旧 feed_url.txt 迁移) ----------

pub fn load_config_from(dir: &Path) -> Config {
    if let Ok(s) = std::fs::read_to_string(dir.join("config.json")) {
        if let Ok(cfg) = serde_json::from_str::<Config>(&s) {
            return cfg;
        }
    }
    // 迁移:旧 feed_url.txt -> 一个 canvas 源
    if let Ok(raw) = std::fs::read_to_string(dir.join("feed_url.txt")) {
        let url = raw.trim_start_matches('\u{feff}').trim().to_string();
        if !url.is_empty() {
            let cfg = Config {
                sources: vec![Source {
                    id: "canvas".to_string(),
                    name: "Canvas".to_string(),
                    kind: "canvas".to_string(),
                    url,
                    color: "#e23b3b".to_string(),
                    enabled: true,
                }],
                window_days: 7,
                refresh_minutes: 30,
            };
            let _ = save_config_to(dir, &cfg);
            return cfg;
        }
    }
    Config::default()
}

pub fn save_config_to(dir: &Path, cfg: &Config) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("config.json"), json).map_err(|e| e.to_string())
}

// ---------- ICS 解析(所有源通用) ----------

fn get_prop(event: &IcalEvent, name: &str) -> Option<String> {
    event
        .properties
        .iter()
        .find(|p| p.name == name)
        .and_then(|p| p.value.clone())
}

fn parse_due(s: &str) -> Option<DateTime<Utc>> {
    if s.contains('T') {
        NaiveDateTime::parse_from_str(s, "%Y%m%dT%H%M%SZ")
            .ok()
            .map(|dt| dt.and_utc())
    } else {
        NaiveDate::parse_from_str(s, "%Y%m%d")
            .ok()
            .and_then(|d| d.and_hms_opt(23, 59, 0))
            .and_then(|naive| Local.from_local_datetime(&naive).single())
            .map(|local| local.with_timezone(&Utc))
    }
}

// 按 kind 把 SUMMARY 解读成 (标题, 课程) —— 每个站点约定不同
fn interpret(kind: &str, summary: &str) -> (String, String) {
    match kind {
        // Canvas: "Quiz - Regex [EECS 201 100 SP 2026]" -> ("Quiz - Regex", "EECS 201")
        "canvas" => {
            if let Some((title, rest)) = summary.rsplit_once(" [") {
                let course = rest
                    .trim_end_matches(']')
                    .split_whitespace()
                    .take(2)
                    .collect::<Vec<_>>()
                    .join(" ");
                (title.to_string(), course)
            } else {
                (summary.to_string(), String::new())
            }
        }
        // 通用兜底:整个 SUMMARY 当标题,无课程(前端用来源名标注)
        _ => (summary.to_string(), String::new()),
    }
}

// ---------- 单个源:拉取 + 解析 + 解读 ----------

fn fetch_source(src: &Source) -> Result<Vec<Raw>, String> {
    let text = minreq::get(src.url.as_str())
        .with_header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        )
        .send()
        .map_err(|e| e.to_string())?
        .as_str()
        .map_err(|e| e.to_string())?
        .to_string();

    let mut raws = Vec::new();
    let reader = ical::IcalParser::new(BufReader::new(text.as_bytes()));
    for cal in reader {
        let cal = cal.map_err(|e| e.to_string())?;
        for event in cal.events {
            let (Some(summary), Some(dtstart)) =
                (get_prop(&event, "SUMMARY"), get_prop(&event, "DTSTART"))
            else {
                continue;
            };
            let Some(due) = parse_due(&dtstart) else { continue };
            let (title, course) = interpret(&src.kind, &summary);
            let url = get_prop(&event, "URL").unwrap_or_default();
            raws.push(Raw { course, title, due, url });
        }
    }
    Ok(raws)
}

// ---------- 聚合所有启用的源 ----------

pub fn aggregate(config: &Config) -> Vec<Deadline> {
    let now = Utc::now();
    let until = now + chrono::Duration::days(config.window_days);
    let mut all: Vec<(DateTime<Utc>, Deadline)> = Vec::new();

    for src in config.sources.iter().filter(|s| s.enabled) {
        match fetch_source(src) {
            Ok(raws) => {
                for r in raws {
                    all.push((
                        r.due,
                        Deadline {
                            source: src.name.clone(),
                            color: src.color.clone(),
                            course: r.course,
                            title: r.title,
                            due: r.due.with_timezone(&Local).format("%m-%d %H:%M").to_string(),
                            url: r.url,
                        },
                    ));
                }
            }
            // 单个源失败不拖垮整体,记日志、跳过
            Err(e) => eprintln!("[source '{}'] fetch failed: {}", src.name, e),
        }
    }

    all.sort_by_key(|(d, _)| *d);
    all.into_iter()
        .filter(|(d, _)| *d >= now && *d <= until)
        .map(|(_, dl)| dl)
        .collect()
}

// ---------- 测试一个源(设置面板的"测试"按钮):返回解析到的事件总数 ----------

pub fn test_source(url: &str, kind: &str) -> Result<usize, String> {
    let src = Source {
        id: String::new(),
        name: "test".to_string(),
        kind: kind.to_string(),
        url: url.to_string(),
        color: default_color(),
        enabled: true,
    };
    Ok(fetch_source(&src)?.len())
}
