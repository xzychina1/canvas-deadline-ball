# Canvas Deadline Ball 🔴

**English** · [简体中文](README.zh-CN.md)

Always-on-top desktop floating balls that show your upcoming deadlines from **Canvas**, **Google Calendar**, or any **ICS** calendar feed — one ball per source, with a live countdown — so you can glance at what's due without opening anything.

<p align="center">
  <img src="docs/balls.png" width="420" alt="Two deadline balls on the desktop" /><br />
  <img src="docs/detail1.png" width="280" alt="Expanded deadline list" />
  <img src="docs/setting1.png" width="280" alt="Settings panel" />
</p>

## Why

Canvas is fine, but you have to *go look*. This lives on your desktop instead: a small ball per calendar showing how many things are due in the next 7 days and a live countdown to the soonest one. Click it to expand the list, click an item to open it, check it off when it's done.

## Features

- 🔴 One frameless, transparent, always-on-top, draggable ball **per source** (Canvas / Google Calendar / any ICS)
- ⏱️ Live countdown to the nearest deadline, color-coded by urgency (green → yellow → red)
- 📋 Click to expand the 7-day list; click an item to open it in your browser
- ✅ **Mark done** — check off a deadline and it leaves the count
- 🔄 **Canvas auto-complete (beta)** — log into Canvas once and submitted assignments get checked off automatically (see Setup)
- ⚙️ Visual settings — add/remove sources, pick colors, switch 中文 / English; auto-refreshes on a timer
- 🪶 Lightweight — built with [Tauri](https://tauri.app) (Rust + the OS WebView), not Electron

## Setup

1. **Get a calendar feed (ICS) URL.**
   - **Canvas**: *Calendar → Calendar Feed* (bottom-right) → copy the `.ics` URL.
   - **Google Calendar**: *Settings and sharing → Integrate calendar → Secret address in iCal format*.
   > ⚠️ Treat these URLs like a password — anyone who has one can read your calendar. You can reset it if it leaks.
2. **Add it in the app**: click the ball → ⚙ settings → paste the URL, pick a kind (Canvas / Google / generic ICS) and a color → **Test** → **Add** → **Save**. A ball appears for that source.
3. *(optional)* **Canvas auto-complete**: in settings, **log in to Canvas** once. From then on the app reads your submitted assignments via the Canvas API using your logged-in session and checks them off automatically. Handy when your school blocks API tokens (e.g. UMich) — it works through the normal web login, like a campus-VPN sign-in.
   > **Which Canvas does it log into?** *Yours.* The site URL is taken automatically from your Canvas ICS link, so it always points at your own school — nothing is hard-coded. Don't want to set up an ICS source, or does your Canvas live on a different host? Just type it into the **Canvas URL** box in settings, e.g. `https://yourschool.instructure.com`.
   >
   > *Canvas only; other calendars stay manual check-off.*

## Build from source

**Prerequisites:** [Rust](https://rustup.rs) (MSVC toolchain on Windows) and [Node.js](https://nodejs.org).

```bash
npm install
npm run tauri dev      # run in dev
npm run tauri build    # produce a release installer
```

> On low-RAM Windows machines the first build can run out of memory (Tauri pulls a large dependency tree). If it OOMs, build single-threaded: `cargo build -j 1` inside `src-tauri/`.

## How it works

- **Backend (Rust, `src-tauri/`)** — fetches each ICS feed (`minreq`, native TLS), parses events (`ical`), converts due times to your local timezone (`chrono`), filters to the next 7 days, and aggregates per source. For auto-complete it opens a hidden Canvas login webview, reads the session cookie, and calls the Canvas planner API to find submitted assignments.
- **Frontend (vanilla HTML/CSS/JS, `src/`)** — one window per source: the ball, its expandable card, the settings panel, the countdown, and manual drag-vs-click handling.

## Known limitations

- Assignments whose feed entry has no specific time are assumed due at **23:59 local time**.
- The ICS feed updates on the provider's own schedule, so it isn't strictly real-time.
- Auto-complete is **Canvas-only** and needs a one-time login (the session persists between runs); other sources use manual check-off.
- **Multiple Canvas schools:** auto-complete points at one Canvas at a time, and completed items are matched by Canvas assignment ID — which is only unique *within* a school. Juggling two Canvas accounts can occasionally cross wires; a single school works perfectly.
- Windows only for now (it's a Tauri app, so macOS/Linux are possible later).

## Tech stack

Tauri v2 · Rust · vanilla JS · Canvas ICS feed + planner API

## Contributing / Issues

Found a bug, hit a setup snag, or want it on **macOS / Linux** — or a calendar source it doesn't handle yet? Please [open an issue](../../issues). Usage questions and "please support X" requests are genuinely welcome — this is a small personal project, so what people ask for is what gets built next.

---

A little thing I made for myself — in memory of the quiz 1 I missed this semester and wasn't allowed to make up. 🥲
