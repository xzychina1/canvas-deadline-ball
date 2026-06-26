use chrono::{DateTime, Local, NaiveDate, NaiveDateTime, TimeZone, Utc};
use ical::parser::ical::component::IcalEvent;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
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
    #[serde(default = "default_lang")]
    pub lang: String,
    // 可选:手填的 Canvas 站点网址(给不想配 ICS、只想用登录/自动完成的人)。
    // 留空则前端自动取自第一个 canvas 源的链接。
    #[serde(default)]
    pub canvas_base_url: String,
}

fn default_window() -> i64 {
    7
}
fn default_refresh() -> u64 {
    30
}
fn default_lang() -> String {
    "zh".to_string()
}

impl Default for Config {
    fn default() -> Self {
        Config {
            sources: Vec::new(),
            window_days: 7,
            refresh_minutes: 30,
            lang: "zh".to_string(),
            canvas_base_url: String::new(),
        }
    }
}

// ---------- 发给前端的一条 ddl ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Deadline {
    pub source: String,
    pub color: String,
    pub course: String,
    pub title: String,
    pub due: String, // 本地 "MM-DD HH:MM"
    pub due_ms: i64, // Unix 毫秒,给前端做倒计时
    pub uid: String, // ICS 事件唯一 id,用于"标记完成"
    pub url: String,
}

// 内部:带真实时间,用于排序/过滤
struct Raw {
    course: String,
    title: String,
    due: DateTime<Utc>,
    url: String,
    uid: String,
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
                lang: "zh".to_string(),
                canvas_base_url: String::new(),
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
        // 先试 UTC("...Z");再试无 Z 的本地时间(Google Calendar 用 TZID 时常见)
        if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y%m%dT%H%M%SZ") {
            return Some(dt.and_utc());
        }
        if let Ok(naive) = NaiveDateTime::parse_from_str(s, "%Y%m%dT%H%M%S") {
            return Local
                .from_local_datetime(&naive)
                .single()
                .map(|l| l.with_timezone(&Utc));
        }
        None
    } else {
        // 只有日期:补当天 23:59,按本地时区解释
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

// 从 Canvas ICS URL 抠出 assignment id(和 planner API 的 plannable_id 对账用)
pub fn assignment_id(url: &str) -> Option<String> {
    let i = url.find("assignment_")?;
    let digits: String = url[i + "assignment_".len()..]
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    if digits.is_empty() {
        None
    } else {
        Some(digits)
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
            let uid =
                get_prop(&event, "UID").unwrap_or_else(|| format!("{}|{}", summary, dtstart));
            raws.push(Raw { course, title, due, url, uid });
        }
    }
    Ok(raws)
}

// ---------- 聚合所有启用的源 ----------

pub fn aggregate(config: &Config, completed: &HashSet<String>) -> Vec<Deadline> {
    let now = Utc::now();
    let until = now + chrono::Duration::days(config.window_days);
    let mut all: Vec<(DateTime<Utc>, Deadline)> = Vec::new();

    for src in config.sources.iter().filter(|s| s.enabled) {
        match fetch_source(src) {
            Ok(raws) => {
                for r in raws {
                    let done = completed.contains(&r.uid)
                        || assignment_id(&r.url)
                            .map(|id| completed.contains(&format!("assignment:{}", id)))
                            .unwrap_or(false);
                    if done {
                        continue; // 已完成(手动打勾 或 Canvas API 检测),跳过
                    }
                    all.push((
                        r.due,
                        Deadline {
                            source: src.name.clone(),
                            color: src.color.clone(),
                            course: r.course,
                            title: r.title,
                            due: r.due.with_timezone(&Local).format("%m-%d %H:%M").to_string(),
                            due_ms: r.due.timestamp_millis(),
                            uid: r.uid,
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

/// 只取某一个源的未来作业(给"每源一个球")
pub fn deadlines_for(
    config: &Config,
    source_id: &str,
    completed: &HashSet<String>,
) -> Vec<Deadline> {
    let sub = Config {
        sources: config
            .sources
            .iter()
            .filter(|s| s.id == source_id)
            .cloned()
            .collect(),
        window_days: config.window_days,
        refresh_minutes: config.refresh_minutes,
        lang: config.lang.clone(),
        canvas_base_url: config.canvas_base_url.clone(),
    };
    aggregate(&sub, completed)
}

// ---------- Canvas planner API → ddl(给 kind="canvas-api":免 ICS,直接登录拉) ----------

// 把 /api/v1/planner/items 的返回转成本源的 ddl 列表。
// 截止时间优先取 plannable.due_at,退回 item.plannable_date;
// 已交/已评分/已手动标记的直接跳过(自动完成内建);uid 带域名隔离不同学校。
pub fn planner_to_deadlines(
    body: &str,
    base: &str,
    src: &Source,
    completed: &HashSet<String>,
    window_days: i64,
) -> Result<Vec<Deadline>, String> {
    let v: serde_json::Value = serde_json::from_str(body).map_err(|e| {
        format!(
            "planner JSON 解析失败(多半是没登录,返回了登录页): {} (前 120 字: {})",
            e,
            body.chars().take(120).collect::<String>()
        )
    })?;
    let arr = v.as_array().ok_or("planner 返回不是数组")?;

    let now = Utc::now();
    let until = now + chrono::Duration::days(window_days);
    let base_trim = base.trim_end_matches('/');
    let mut all: Vec<(DateTime<Utc>, Deadline)> = Vec::new();

    for item in arr {
        let ptype = item
            .get("plannable_type")
            .and_then(|x| x.as_str())
            .unwrap_or("");
        // 只要"要交的东西",忽略公告/纯日历事件/便签
        if matches!(ptype, "announcement" | "calendar_event" | "planner_note") {
            continue;
        }
        let plannable = item.get("plannable");
        // 只认有真实截止时间(due_at)的项。没有 due_at 的(页面/未评分讨论等)其
        // plannable_date 只是 planner 的排序锚点,不是 ddl,拿来当倒计时是假的。
        let Some(due_str) = plannable
            .and_then(|p| p.get("due_at"))
            .and_then(|x| x.as_str())
        else {
            continue;
        };
        let Ok(due) = DateTime::parse_from_rfc3339(due_str) else {
            continue;
        };
        let due = due.with_timezone(&Utc);

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
        // plannable_id 可能是数字或(大 id 时)字符串;缺失就跳过 —— 别用 0 兜底,
        // 否则多个缺 id 的项会撞成同一 uid,打勾一个会连带隐藏一片。
        let Some(id) = item.get("plannable_id").and_then(|x| {
            x.as_i64()
                .map(|n| n.to_string())
                .or_else(|| x.as_str().map(|s| s.to_string()))
        }) else {
            continue;
        };
        let uid = format!("{}|planner:{}", base_trim, id);
        // 既认本路径的 key,也认 ICS/自动同步写的 assignment:<id>,
        // 这样同一作业在两种球之间标记完成是一致的。
        if submitted
            || graded
            || marked
            || completed.contains(&uid)
            || completed.contains(&format!("assignment:{}", id))
        {
            continue; // 已完成(API 检测 或 手动打勾)
        }

        let title = plannable
            .and_then(|p| p.get("title").or_else(|| p.get("name")))
            .and_then(|x| x.as_str())
            .unwrap_or("(untitled)")
            .to_string();
        let course = item
            .get("context_name")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let url = item
            .get("html_url")
            .and_then(|x| x.as_str())
            .map(|h| {
                if h.starts_with("http") {
                    h.to_string()
                } else {
                    format!("{}{}", base_trim, h)
                }
            })
            .unwrap_or_default();

        all.push((
            due,
            Deadline {
                source: src.name.clone(),
                color: src.color.clone(),
                course,
                title,
                due: due.with_timezone(&Local).format("%m-%d %H:%M").to_string(),
                due_ms: due.timestamp_millis(),
                uid,
                url,
            },
        ));
    }

    all.sort_by_key(|(d, _)| *d);
    Ok(all
        .into_iter()
        .filter(|(d, _)| *d >= now && *d <= until)
        .map(|(_, dl)| dl)
        .collect())
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
