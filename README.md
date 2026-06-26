# Canvas Deadline Ball 🔴

**English** · [简体中文](README.zh-CN.md)

A tiny always-on-top desktop floating ball that shows your upcoming **Canvas** assignment
deadlines — so you can glance at what's due this week without ever opening Canvas.

<!-- TODO: add a screenshot or GIF here, e.g. ![demo](docs/demo.gif) — strongly recommended for a portfolio repo -->

## Why

Canvas is fine, but you have to *go look*. This lives on your desktop instead: a small ball
showing how many assignments are due in the next 7 days and the soonest due date. Click it to
expand the full list; click any item to jump straight to it in Canvas.

## Features

- 🔴 Frameless, transparent, always-on-top, draggable ball
- 📅 Reads your assignments from your Canvas **calendar feed (ICS)** — no API token needed
- 🗓️ Shows the count + nearest deadline; click to expand the full 7-day list
- 🔗 Click any assignment to open it in your browser
- 🪶 Lightweight — built with [Tauri](https://tauri.app) (Rust + the OS WebView), not Electron

## Setup

### 1. Get your Canvas calendar feed URL
In Canvas: **Calendar → Calendar Feed** (bottom-right) → copy the `.ics` URL.

> ⚠️ Treat this URL like a password — anyone who has it can read your calendar. You can reset it in Canvas if it leaks.

### 2. Tell the app your feed URL
Create a file named `feed_url.txt` containing just that URL, at:

```
%APPDATA%\com.canvasdeadlineball.app\feed_url.txt
```

(i.e. `C:\Users\<you>\AppData\Roaming\com.canvasdeadlineball.app\feed_url.txt`)

### 3. Run it
Grab a release binary, or build from source (below).

## Build from source

**Prerequisites:** [Rust](https://rustup.rs) (MSVC toolchain on Windows) and [Node.js](https://nodejs.org).

```bash
npm install
npm run tauri dev      # run in dev
npm run tauri build    # produce a release binary
```

> On low-RAM Windows machines the first build can run out of memory (Tauri pulls a large
> dependency tree). If it OOMs, build single-threaded: run `cargo build -j 1` inside `src-tauri/`.

## How it works

- **Backend (Rust, `src-tauri/`)** — fetches the ICS feed (`minreq`, native TLS), parses events
  (`ical`), converts due dates to your local timezone (`chrono`), filters to the next 7 days, and
  exposes a `get_deadlines` command to the frontend.
- **Frontend (vanilla HTML/CSS/JS, `src/`)** — the ball and its expandable card; resizes the
  window on expand, and handles drag-vs-click manually so the ball is both draggable and clickable.

## Known limitations

- Assignments whose feed entry has no specific time are assumed due at **23:59 local time**.
- Data is fetched **on launch only** (periodic auto-refresh is planned).
- The ICS feed updates on Canvas's own schedule, so it isn't strictly real-time.

## Tech stack

Tauri v2 · Rust · vanilla JS · Canvas ICS calendar feed

---

Built as a learning / portfolio project.
