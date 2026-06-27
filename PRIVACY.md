# Privacy

**English** · [简体中文](PRIVACY.zh-CN.md)

**Short version: this app runs entirely on your own computer. There is no account, no server, and nothing is ever uploaded.**

## What it touches, and where it stays

- **Your calendar feed (ICS) URL** — stored locally in `%APPDATA%\com.canvasdeadlineball.app\config.json`. Used only to fetch your deadlines directly from Canvas / Google / your calendar provider, from your machine.
- **Your Canvas login (optional auto-complete)** — when you log in, it happens in a normal Canvas web-login window embedded in the app. The session (cookie) is kept locally by the system WebView, exactly like a browser tab. **The app never sees or stores your password**, and the session never leaves your device.
- **Your checked-off items and window positions** — small local files in that same folder.

No telemetry, no analytics, no crash reporting, no "phone home." The app makes network requests **only** to your calendar feed provider and — if you enable auto-complete — your own Canvas site. Nowhere else.

## ⚠️ Treat your ICS feed URL like a password

A Canvas / Google calendar feed URL contains a **secret token** — anyone who has the link can read your calendar. So:

- Don't paste it in public or share it.
- It's stored locally and is never uploaded by this app.
- If it ever leaks, **reset the feed** in Canvas / Google to invalidate the old link.

## Don't take our word for it

The entire app is [open-source](../../). You (or anyone) can read the code and confirm your feed URL and login stay on your device and nothing is sent to us — because there's no "us" server to send it to.
