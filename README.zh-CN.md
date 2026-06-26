# Canvas Deadline Ball 🔴

[English](README.md) · **简体中文**

一个常驻桌面、永远置顶的悬浮球,显示你 **Canvas** 上即将到期的作业 —— 不用打开 Canvas,扫一眼桌面就知道这周要交什么。

<!-- TODO: 在这里放一张球的截图或 GIF,例如 ![demo](docs/demo.gif) —— 作品集强烈建议加 -->

## 为什么做它

Canvas 挺好,但你得**主动去看**。这个东西直接活在你桌面上:一个小球显示未来 7 天有几个作业要交、以及最近的截止日期。点一下展开完整列表;点任意一条直接跳到 Canvas 对应页面。

## 功能

- 🔴 无边框、透明、永远置顶、可拖动的悬浮球
- 📅 从 Canvas 的**日历订阅源(ICS)**读取作业 —— 不需要 API token
- 🗓️ 显示数量 + 最近 ddl;点击展开未来 7 天完整列表
- 🔗 点任意作业用浏览器打开它的 Canvas 页面
- 🪶 轻量 —— 基于 [Tauri](https://tauri.app)(Rust + 系统 WebView),不是 Electron

## 配置

### 1. 拿到你的 Canvas 日历订阅链接
在 Canvas:**Calendar(日历)→ Calendar Feed**(右下角)→ 复制那条 `.ics` 链接。

> ⚠️ 把这条链接当密码看待 —— 拿到它的人就能看你的日历。泄露了可以在 Canvas 里重置。

### 2. 把链接告诉 App
新建一个名为 `feed_url.txt` 的文件,内容就是那条链接,放在:

```
%APPDATA%\com.canvasdeadlineball.app\feed_url.txt
```

(即 `C:\Users\<你>\AppData\Roaming\com.canvasdeadlineball.app\feed_url.txt`)

### 3. 运行
下载 release 版,或从源码构建(见下)。

## 从源码构建

**前置:** [Rust](https://rustup.rs)(Windows 上用 MSVC 工具链)和 [Node.js](https://nodejs.org)。

```bash
npm install
npm run tauri dev      # 开发运行
npm run tauri build    # 打包 release
```

> 在内存较小的 Windows 机器上,首次构建可能把内存吃爆(Tauri 依赖树很大)。如果 OOM,改成单线程构建:在 `src-tauri/` 里跑 `cargo build -j 1`。

## 工作原理

- **后端(Rust,`src-tauri/`)** —— 拉取 ICS 源(`minreq`,原生 TLS),解析事件(`ical`),把截止时间转成本地时区(`chrono`),过滤出未来 7 天,通过 `get_deadlines` 命令交给前端。
- **前端(原生 HTML/CSS/JS,`src/`)** —— 球和它的展开卡片;展开时动态调整窗口大小;手动区分「拖动 vs 点击」,让球既能拖又能点。

## 已知局限

- feed 里没有具体时间的作业,默认按**本地时间 23:59** 截止处理。
- 数据**只在启动时拉取一次**(定时自动刷新待做)。
- ICS 源按 Canvas 自己的节奏更新,不是严格实时。

## 技术栈

Tauri v2 · Rust · 原生 JS · Canvas ICS 日历源

---

作为学习 / 作品集项目构建。
