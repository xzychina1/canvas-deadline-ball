# Installing Canvas Deadline Ball

**English** · [简体中文](INSTALL.zh-CN.md)

> **Windows only** for now (it's a Tauri app; macOS/Linux are possible later).

## Download

Grab the latest from the [**Releases page**](../../releases/latest):

- **`…-setup.exe`** — the installer (recommended, ~2 MB). Installs the app + a Start-menu shortcut.
- **`…-portable.exe`** — a single portable executable (~9 MB). No install — just double-click to run.

Either works. If you're not sure, use the installer.

## "Windows protected your PC" — this is normal, here's how to run it

Because this is a small, free, indie app that isn't *code-signed* (signing certificates cost money), Windows SmartScreen shows a blue warning the first time you run it:

> **Windows protected your PC**
> Microsoft Defender SmartScreen prevented an unrecognized app from starting…

This is expected for new indie software — it just means Windows doesn't recognize the publisher yet, **not** that anything is wrong. To run it:

1. Click **More info** (the small link in the dialog).
2. Click the **Run anyway** button that appears.

That's it — you only need to do this once.

> **Want to verify it's safe first?** The app is fully [open-source](../../) (you can read every line), and you can upload the downloaded `.exe` to [VirusTotal](https://www.virustotal.com/) to scan it against 70+ antivirus engines.

## Antivirus false positives

Brand-new, unsigned executables sometimes get flagged by an antivirus heuristic — **not** a real detection, just because few people have run them yet. If it happens, the VirusTotal scan above usually shows it's clean. If your AV quarantines it, you can allow/restore it, or use the portable `.exe`.

## Uninstall

- **Installer version**: *Settings → Apps → Canvas Deadline Ball → Uninstall* (or the Start-menu uninstaller).
- **Portable version**: just delete the `.exe`.

Your saved sources/settings live in `%APPDATA%\com.canvasdeadlineball.app\` — delete that folder too for a clean wipe.
