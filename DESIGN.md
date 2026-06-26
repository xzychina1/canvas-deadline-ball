# Design — Multi-source deadlines

## Goal

Grow the single-feed Canvas ball into a small **multi-source deadline aggregator**: track
deadlines from several calendar feeds at once, configured through a visual settings panel, shown
as always-on-top desktop balls.

## Key insight: ICS is only *half* universal

Every source here exposes deadlines as an **iCalendar (ICS / RFC 5545) feed**. The *container* is
identical everywhere — a single parser (`ical`) reads any compliant feed and yields `VEVENT`s with
`SUMMARY`, `DTSTART`, `URL`, etc.

But the *content conventions* are per-site:

- **Canvas** — `SUMMARY = "Quiz - Regex [EECS 201 100 SP 2026]"`, plus a `URL` back to the assignment.
- **Google Calendar / generic** — `SUMMARY` is free text, usually no course, sometimes no `URL`.
- **Other LMSs** — their own `SUMMARY` patterns.

So *fetching + parsing* is universal, but *interpreting* a feed's events into
`{course, title, due, url}` is site-specific. We deliberately do **not** build a grand unified
abstraction. Each source declares a small `kind`, and we add an interpreter only when a real
source needs one (YAGNI). New sites get added on demand, not up front.

## Architecture

### Config (`config.json`, in the app config dir — replaces `feed_url.txt`)

```json
{
  "sources": [
    { "id": "uuid", "name": "Canvas", "kind": "canvas", "url": "https://…ics", "color": "#e23b3b", "enabled": true }
  ],
  "windowDays": 7,
  "refreshMinutes": 30
}
```

On first run, an existing `feed_url.txt` is auto-migrated into one `kind: "canvas"` source.

### Source pipeline

```
fetch ICS (universal) → parse VEVENTs (universal) → interpret by `kind` → Deadline { source, color, course, title, due, url }
```

Interpreters shipped in v1:

- **`canvas`** — existing logic (`Title [COURSE …]`, assignment URL).
- **`ics`** — generic fallback: title = `SUMMARY`, due = `DTSTART`, course = source name, url = `URL` if present. This alone covers Google Calendar and most plain calendars.

More `kind`s are added per real user demand.

### Backend commands (Tauri)

- `get_config` / `save_config` — read/write `config.json`.
- `test_source(url, kind)` — fetch once, return parsed count (for the settings **Test** button).
- `get_deadlines` — run all enabled sources, merge, sort, filter to `windowDays`.

### Frontend

- **Settings window** — list / add / edit / remove sources (name, URL, kind, color), a Test button,
  and the refresh interval. Opens automatically when no source is configured (first-run setup).
- **Ball(s)** — see phasing below.
- **Auto-refresh** — re-run aggregation every `refreshMinutes` (falls out of the config naturally).

## Phasing (lean first — "do the common things first")

- **Phase 1 — aggregated ball.** One ball shows the total count across sources; the expand list is
  color-coded by source. Single window, ships fast, delivers full multi-source value.
- **Phase 2 — per-source balls.** One ball per source (multi-window): independent position,
  lifecycle, and persistence. This is the heaviest piece, so it follows once Phase 1 is solid.

The end goal is per-source balls; Phase 1 is the pragmatic first milestone.

## Scope

- **In:** any number of **ICS** feeds; `canvas` + generic `ics` interpreters; visual config; auto-refresh.
- **Out (for now):** non-ICS sites (e.g. Gradescope) — they need per-site login/scraping, which is
  fragile and may be ToS-restricted. Evaluate feasibility per site, on demand.
- **Separate future branch:** a "desktop pet" skin over the same deadline data — a commercialization
  direction, orthogonal to this design.

## Carried-over assumptions

- Feed entries with no specific time are treated as due **23:59 local time**.
- ICS feeds refresh on each provider's own schedule, so data isn't strictly real-time.
