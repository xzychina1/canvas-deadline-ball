use chrono::{DateTime, Local, NaiveDate, NaiveDateTime, TimeZone, Utc};
use ical::parser::ical::component::IcalEvent;
use std::io::BufReader;

/// 发给前端的一条作业(due 已转成本地时间字符串)
#[derive(serde::Serialize)]
pub struct Assignment {
    pub course: String,
    pub title: String,
    pub due: String, // 本地时间 "MM-DD HH:MM"
    pub url: String,
}

/// 内部用:带真实时间,便于排序/过滤
struct Raw {
    course: String,
    title: String,
    due: DateTime<Utc>,
    url: String,
}

fn get_prop(event: &IcalEvent, name: &str) -> Option<String> {
    event
        .properties
        .iter()
        .find(|p| p.name == name)
        .and_then(|p| p.value.clone())
}

fn parse_due(s: &str) -> Option<DateTime<Utc>> {
    if s.contains('T') {
        // 带时间: "20260601T160000Z"(UTC)
        NaiveDateTime::parse_from_str(s, "%Y%m%dT%H%M%SZ")
            .ok()
            .map(|dt| dt.and_utc())
    } else {
        // 只有日期: 补当天 23:59,并按【本地时区】解释
        NaiveDate::parse_from_str(s, "%Y%m%d")
            .ok()
            .and_then(|d| d.and_hms_opt(23, 59, 0))
            .and_then(|naive| Local.from_local_datetime(&naive).single())
            .map(|local| local.with_timezone(&Utc))
    }
}

fn split_summary(summary: &str) -> Option<(String, String)> {
    let (title, rest) = summary.rsplit_once(" [")?;
    let course = rest
        .trim_end_matches(']')
        .split_whitespace()
        .take(2)
        .collect::<Vec<_>>()
        .join(" ");
    Some((title.to_string(), course))
}

/// 拉取 ICS → 解析 → 未来 7 天、按时间升序
pub fn fetch_and_parse(url: &str) -> Result<Vec<Assignment>, String> {
    let text = minreq::get(url)
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

    let mut raws: Vec<Raw> = Vec::new();
    let reader = ical::IcalParser::new(BufReader::new(text.as_bytes()));
    for cal in reader {
        let cal = cal.map_err(|e| e.to_string())?;
        for event in cal.events {
            let (Some(summary), Some(dtstart), Some(link)) = (
                get_prop(&event, "SUMMARY"),
                get_prop(&event, "DTSTART"),
                get_prop(&event, "URL"),
            ) else {
                continue;
            };
            let Some(due) = parse_due(&dtstart) else { continue };
            let Some((title, course)) = split_summary(&summary) else { continue };
            raws.push(Raw { course, title, due, url: link });
        }
    }
    raws.sort_by_key(|r| r.due);

    let now = Utc::now();
    let week = now + chrono::Duration::days(7);
    let out = raws
        .into_iter()
        .filter(|r| r.due >= now && r.due <= week)
        .map(|r| Assignment {
            course: r.course,
            title: r.title,
            due: r.due.with_timezone(&Local).format("%m-%d %H:%M").to_string(),
            url: r.url,
        })
        .collect();
    Ok(out)
}
