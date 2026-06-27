const { invoke } = window.__TAURI__.core;
const { getCurrentWindow, LogicalSize, PhysicalPosition } = window.__TAURI__.window;
const { listen } = window.__TAURI__.event;
const { WebviewWindow, getAllWebviewWindows } = window.__TAURI__.webviewWindow;
const appWindow = getCurrentWindow();

const SIZES = { ball: [130, 130], list: [320, 460], settings: [360, 560], guide: [360, 560] };

const LABEL = appWindow.label;
const sourceId = LABEL.startsWith("ball::") ? LABEL.slice("ball::".length) : null;

let items = []; // 当前 ddl(null = 出错)
let config = { sources: [], windowDays: 7, refreshMinutes: 30, lang: "zh" };
let state = "ball";
let refreshTimer = null;

// ---------- i18n ----------
const I18N = {
  zh: {
    settings: "设置", language: "语言", refreshInterval: "刷新间隔(分钟)",
    sources: "数据源", addSource: "添加源", namePh: "名字(如 Canvas)",
    urlPh: "ICS 链接 https://....ics", genericIcs: "通用 ICS",
    test: "测试", add: "添加", back: "← 返回", save: "保存",
    next7: "未来 7 天", error: "出错", fetchError: "拉取出错,检查设置里的链接",
    noDdl: "未来 7 天没有 ddl 🎉", noSources: "还没有源,下面添加一个",
    needUrl: "先填链接", testing: "测试中…", testFail: "✗ 失败:",
    needNameUrl: "名字和链接都要填", added: "已添加,记得点保存",
    saveFail: "保存失败:", enabled: "启用", del: "删除", collapse: "收起", markDone: "标记完成",
    canvasUrlPh: "Canvas 网址 https://xxx.instructure.com",
    canvasApiKind: "Canvas(登录免ICS)",
    needCanvas: "先在上面添加一个 Canvas 源",
    autoDoneHint: "给你的 Canvas 源开自动完成:登录一次,已提交的作业会自动划掉。想直接按网址加 Canvas?用上面的「添加源 → Canvas(登录免ICS)」。",
    needLogin: "还没登录 Canvas", loginCanvas: "登录 Canvas", loginShort: "去登录", refreshed: "已刷新",
    guide: "📖 使用说明",
    testOk: (n) => `✓ 成功,解析到 ${n} 个事件`,
    testCanvasOk: (name) => `✓ 成功,已登录:${name}`,
  },
  en: {
    settings: "Settings", language: "Language", refreshInterval: "Refresh (min)",
    sources: "Sources", addSource: "Add source", namePh: "Name (e.g. Canvas)",
    urlPh: "ICS URL https://....ics", genericIcs: "Generic ICS",
    test: "Test", add: "Add", back: "← Back", save: "Save",
    next7: "Next 7 days", error: "Error",
    fetchError: "Fetch error — check the URL in settings",
    noDdl: "Nothing due in 7 days 🎉", noSources: "No sources yet — add one below",
    needUrl: "Enter a URL first", testing: "Testing…", testFail: "✗ Failed: ",
    needNameUrl: "Name and URL are required", added: "Added — remember to Save",
    saveFail: "Save failed: ", enabled: "Enabled", del: "Delete", collapse: "Collapse", markDone: "Mark done",
    canvasUrlPh: "Canvas URL https://xxx.instructure.com",
    canvasApiKind: "Canvas (login, no ICS)",
    needCanvas: "Add a Canvas source above first",
    autoDoneHint: "Turn on auto-complete for your Canvas source: log in once and submitted assignments get checked off. Want to add Canvas by URL? Use \"Add source → Canvas (login, no ICS)\" above.",
    needLogin: "Not logged in to Canvas", loginCanvas: "Log in to Canvas", loginShort: "Log in", refreshed: "Refreshed",
    guide: "📖 Guide",
    testOk: (n) => `✓ OK — parsed ${n} events`,
    testCanvasOk: (name) => `✓ OK — logged in: ${name}`,
  },
};
let lang = "zh";
function t(k) {
  const v = I18N[lang] && I18N[lang][k];
  return v !== undefined ? v : I18N.zh[k] !== undefined ? I18N.zh[k] : k;
}

function applyLang() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.placeholder = t(el.getAttribute("data-i18n-ph"));
  });
  document.getElementById("gear").title = t("settings");
  document.getElementById("help").title = t("guide");
  const ls = document.getElementById("lang-select");
  if (ls) ls.value = lang;
  applyIdentity();
  renderBallAndList();
  renderSettings();
  renderGuide();
}

// ---------- 使用说明(指南) ----------
const GUIDE = {
  zh: `
    <h2>这是什么</h2>
    <p>桌面上的悬浮球,显示你未来 7 天要交的作业,不用一直开着 Canvas。每个数据源一个球。</p>
    <h2>① 添加来源</h2>
    <p>点球 → ⚙ → <b>添加源</b>,选类型:</p>
    <ul>
      <li><b>Canvas(登录免ICS)</b> —— 最省事。填学校 Canvas 网址(如 <code>https://你的学校.instructure.com</code>)→ 测试 → 添加 → 保存。再点球上的「去登录」登录一次,作业就出来了。</li>
      <li><b>Canvas (ICS)</b> —— 想用日历订阅:Canvas 里 Calendar → Calendar Feed,复制那条 <code>.ics</code> 链接填进来。</li>
      <li><b>Google 日历 / 通用 ICS</b> —— 填对应的 ICS 链接。</li>
    </ul>
    <h2>② 看 &amp; 用</h2>
    <ul>
      <li>点球展开列表;点某条用浏览器打开。</li>
      <li>做完点 <b>✓</b> 标记完成,它从计数消失。</li>
      <li>按住球可拖动,位置会记住。</li>
      <li>数字颜色 = 任务多少(少绿多红);倒计时颜色 = 离最近 ddl 多久。</li>
    </ul>
    <h2>③ 自动完成(仅 Canvas)</h2>
    <p>登录一次后,已提交 / 已评分的作业会被自动隐藏,不用手动打勾。登录态会保留;过期了再登一次。</p>
    <h2>隐私</h2>
    <p>你的链接和登录只存在自己电脑上,不上传任何服务器。</p>
    <h2>小提示</h2>
    <p>没有具体时间的作业按当天 23:59 算。设置里可切中/英文、改刷新间隔。</p>
  `,
  en: `
    <h2>What it is</h2>
    <p>A desktop floating ball showing what's due in the next 7 days, so you don't keep Canvas open. One ball per source.</p>
    <h2>① Add a source</h2>
    <p>Click the ball → ⚙ → <b>Add source</b>, pick a kind:</p>
    <ul>
      <li><b>Canvas (login, no ICS)</b> — easiest. Type your school's Canvas URL (e.g. <code>https://yourschool.instructure.com</code>) → Test → Add → Save. Then click <b>Log in</b> on the ball once and your assignments appear.</li>
      <li><b>Canvas (ICS)</b> — if you prefer a calendar feed: in Canvas, Calendar → Calendar Feed, copy the <code>.ics</code> URL.</li>
      <li><b>Google Calendar / generic ICS</b> — paste the matching ICS URL.</li>
    </ul>
    <h2>② View &amp; use</h2>
    <ul>
      <li>Click the ball to expand the list; click an item to open it.</li>
      <li>Hit <b>✓</b> to mark done — it leaves the count.</li>
      <li>Drag the ball to move it; its position is remembered.</li>
      <li>Count color = how many (green→red); countdown color = time left to the nearest deadline.</li>
    </ul>
    <h2>③ Auto-complete (Canvas only)</h2>
    <p>After one login, submitted / graded assignments are hidden automatically. The session persists; just log in again if it expires.</p>
    <h2>Privacy</h2>
    <p>Your URLs and login stay on your own computer — nothing is uploaded to any server.</p>
    <h2>Tip</h2>
    <p>Assignments with no specific time are treated as due 23:59. Settings can switch 中文/English and the refresh interval.</p>
  `,
};
function renderGuide() {
  const el = document.getElementById("guide-body");
  if (el) el.innerHTML = GUIDE[lang] || GUIDE.zh;
}

function esc(s) {
  return String(s == null ? "" : s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

// ---------- 数据(只拉本源) ----------
async function refresh() {
  if (sourceId === null) {
    items = [];
    renderBallAndList();
    tick();
    return;
  }
  // canvas-api 源:免 ICS,直接用登录态调 Canvas API 拿 ddl;其余走 ICS
  const me = (config.sources || []).find((s) => s.id === sourceId);
  const cmd = me && me.kind === "canvas-api" ? "get_canvas_deadlines" : "get_source_deadlines";
  try {
    items = await invoke(cmd, { sourceId });
  } catch (e) {
    if (String(e).includes("NOT_LOGGED_IN")) {
      items = "login"; // 未登录:渲染"去登录"而不是"出错"
    } else {
      console.error(cmd + " failed:", e);
      items = null;
    }
  }
  renderBallAndList();
  tick();
}

function renderBallAndList() {
  const countEl = document.getElementById("count");
  const cardCount = document.getElementById("card-count");
  const listEl = document.getElementById("list");

  if (items === null) {
    countEl.textContent = "!";
    cardCount.textContent = "!";
    countEl.style.color = "#e2503b";
    cardCount.style.color = "#e2503b";
    listEl.innerHTML = `<div class="empty">${esc(t("fetchError"))}</div>`;
    return;
  }

  if (items === "login") {
    countEl.textContent = "↪";
    cardCount.textContent = "↪";
    countEl.style.color = "#9ad36b";
    cardCount.style.color = "#9ad36b";
    listEl.innerHTML = `<div class="empty">${esc(t("needLogin"))}</div>`;
    const btn = document.createElement("button");
    btn.className = "primary";
    btn.textContent = t("loginCanvas");
    btn.style.cssText = "display:block;margin:10px auto;";
    btn.addEventListener("click", loginAndPoll);
    listEl.appendChild(btn);
    return;
  }

  countEl.textContent = String(items.length);
  cardCount.textContent = String(items.length);
  const cc = countColor(items.length);
  countEl.style.color = cc;
  cardCount.style.color = cc;

  listEl.innerHTML = "";
  if (items.length === 0) {
    listEl.innerHTML = `<div class="empty">${esc(t("noDdl"))}</div>`;
    return;
  }
  for (const it of items) {
    const row = document.createElement("div");
    row.className = "item";
    row.style.borderLeftColor = it.color || "#e23b3b";
    const tag = it.course && it.course.length ? it.course : it.source;

    const main = document.createElement("div");
    main.className = "row-main";
    main.innerHTML =
      `<div class="when">${esc(it.due)}</div>` +
      `<div class="what"><span class="tag" style="color:${esc(it.color)}">${esc(tag)}</span>${esc(it.title)}</div>`;
    if (it.url) main.addEventListener("click", () => invoke("open_url", { url: it.url }));
    else main.style.cursor = "default";

    const done = document.createElement("button");
    done.className = "done-btn";
    done.textContent = "✓";
    done.title = t("markDone");
    done.addEventListener("click", async (e) => {
      e.stopPropagation();
      await invoke("mark_done", { uid: it.uid });
      await refresh();
    });

    row.appendChild(main);
    row.appendChild(done);
    listEl.appendChild(row);
  }
}

// ---------- 倒计时时钟(到最近 ddl) ----------
function fmtCountdown(ms) {
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n) => String(n).padStart(2, "0");
  return days > 0
    ? `${days}d ${p(h)}:${p(m)}:${p(sec)}`
    : `${p(h)}:${p(m)}:${p(sec)}`;
}

function tick() {
  const labelEl = document.getElementById("label");
  const cd = document.getElementById("card-countdown");
  let text;
  if (items === null) {
    text = t("error");
  } else if (items === "login") {
    text = t("loginShort");
  } else if (items.length === 0) {
    text = "--:--:--";
  } else {
    const remaining = items[0].dueMs - Date.now();
    text = remaining <= 0 ? "00:00:00" : fmtCountdown(remaining);
    if (remaining <= 0) refresh(); // 过期了重拉,后端会把它移出
  }
  let col;
  if (items === null) col = "#e2503b";
  else if (items === "login") col = "#9ad36b";
  else if (items.length === 0) col = "#8a8a8a";
  else col = urgencyColor(items[0].dueMs - Date.now());
  if (labelEl) {
    labelEl.textContent = text;
    labelEl.style.color = col;
  }
  if (cd) {
    cd.textContent = text;
    cd.style.color = col;
  }
}

// ---------- 颜色:对比 + 紧急度 ----------
function hexToRgb(hex) {
  const h = String(hex || "#e23b3b").replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}
function lum(rgb) {
  return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
}
// 来源色太暗,在深色球上看不清 → 自动提亮,保证和深底有对比
function displayColor(hex) {
  let rgb = hexToRgb(hex);
  if (lum(rgb) < 0.35) rgb = rgb.map((c) => Math.round(c + (255 - c) * 0.55));
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}
// 数量越多越红
function countColor(n) {
  if (n <= 0) return "#8a8a8a";
  if (n <= 2) return "#3ad36b";
  if (n <= 5) return "#e2c34d";
  return "#e2503b";
}
// 剩余时间越短越红
function urgencyColor(ms) {
  if (ms == null) return "#8a8a8a";
  const h = ms / 3600000;
  if (h < 1) return "#e2503b";
  if (h < 6) return "#e8823b";
  if (h < 24) return "#e2c34d";
  if (h < 72) return "#9ad36b";
  return "#3ad36b";
}

// 用本源的颜色(描边/来源名)装扮这个球;深底 + 提亮来源色保证对比
function applyIdentity() {
  const me = (config.sources || []).find((s) => s.id === sourceId);
  const dc = displayColor(me ? me.color : "#e23b3b");
  document.getElementById("ball").style.borderColor = dc;
  const bs = document.getElementById("ball-source");
  bs.textContent = me ? me.name : "";
  bs.style.color = dc;
  document.getElementById("card-header").style.borderBottomColor = dc;
  const hn = document.getElementById("header-name");
  hn.textContent = me ? me.name : t("next7");
  hn.style.color = dc;
}

// ---------- 视图状态 ----------
async function setState(s) {
  state = s;
  await appWindow.setSize(new LogicalSize(...SIZES[s]));
  document.getElementById("ball").hidden = s !== "ball";
  document.getElementById("card").hidden = s === "ball";
  document.getElementById("list-view").hidden = s !== "list";
  document.getElementById("settings-view").hidden = s !== "settings";
  document.getElementById("guide-view").hidden = s !== "guide";
  document.getElementById("gear").hidden = s !== "list";
  document.getElementById("help").hidden = s !== "list";
  document.getElementById("collapse").hidden = s !== "list";
}

// 打开使用说明,记住从哪进来的好返回
let guideFrom = "list";
function openGuide() {
  guideFrom = state === "settings" ? "settings" : "list";
  renderGuide();
  setState("guide");
}

// ---------- 设置面板 ----------
function renderSettings() {
  document.getElementById("refresh-input").value = config.refreshMinutes;
  const wrap = document.getElementById("source-list");
  wrap.innerHTML = "";
  if (!config.sources.length) {
    wrap.innerHTML = `<div class="empty">${esc(t("noSources"))}</div>`;
  }
  config.sources.forEach((src, i) => {
    const row = document.createElement("div");
    row.className = "src-row";
    row.innerHTML =
      `<span class="dot" style="background:${esc(src.color)}"></span>` +
      `<span class="src-name">${esc(src.name)}</span>` +
      `<span class="src-kind">${esc(src.kind)}</span>`;
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = src.enabled;
    chk.title = t("enabled");
    chk.addEventListener("change", () => {
      config.sources[i].enabled = chk.checked;
    });
    const del = document.createElement("button");
    del.textContent = "🗑";
    del.className = "del";
    del.title = t("del");
    del.addEventListener("click", () => {
      config.sources.splice(i, 1);
      renderSettings();
    });
    row.appendChild(chk);
    row.appendChild(del);
    wrap.appendChild(row);
  });
}

async function testSource() {
  const url = document.getElementById("add-url").value.trim();
  const kind = document.getElementById("add-kind").value;
  const msg = document.getElementById("add-msg");
  if (!url) {
    msg.textContent = t("needUrl");
    return;
  }
  msg.textContent = t("testing");
  try {
    if (kind === "canvas-api") {
      // 免 ICS 的 Canvas 源:没法解析 ICS,改成验证登录态(用规整后的 origin)
      const base = normOrigin(url) || url;
      const json = await invoke("canvas_api", { baseUrl: base, path: "/api/v1/users/self" });
      const u = JSON.parse(json);
      msg.textContent = t("testCanvasOk")(u.name || u.short_name || "ok");
    } else {
      const n = await invoke("test_source", { url, kind });
      msg.textContent = t("testOk")(n);
    }
  } catch (e) {
    msg.textContent = t("testFail") + e;
  }
}

function addSource() {
  const name = document.getElementById("add-name").value.trim();
  const url = document.getElementById("add-url").value.trim();
  const kind = document.getElementById("add-kind").value;
  const color = document.getElementById("add-color").value;
  const msg = document.getElementById("add-msg");
  if (!name || !url) {
    msg.textContent = t("needNameUrl");
    return;
  }
  let saveUrl = url;
  if (kind === "canvas-api") {
    // 统一成 https://xxx.instructure.com(去掉多余路径/补 scheme),否则后端拉数据会失败
    const o = normOrigin(url);
    if (!o) {
      msg.textContent = t("needUrl");
      return;
    }
    saveUrl = o;
  }
  config.sources.push({ id: crypto.randomUUID(), name, kind, url: saveUrl, color, enabled: true });
  document.getElementById("add-name").value = "";
  document.getElementById("add-url").value = "";
  msg.textContent = t("added");
  renderSettings();
}

// JS 端同步窗口集合(从命令线程建窗会冻 UI,所以放前端异步建)
async function syncWindows() {
  const enabled = (config.sources || []).filter((s) => s.enabled);
  const desired = new Set(enabled.map((s) => "ball::" + s.id));
  const all = await getAllWebviewWindows();
  const existing = new Set(all.map((w) => w.label));

  enabled.forEach((s, i) => {
    const label = "ball::" + s.id;
    if (!existing.has(label)) {
      new WebviewWindow(label, {
        url: "index.html",
        width: 130,
        height: 130,
        x: 220 + i * 120,
        y: 220,
        transparent: true,
        decorations: false,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        shadow: false,
        title: "Canvas Deadline Ball",
      });
    }
  });

  for (const w of all) {
    if (w.label.startsWith("ball::") && !desired.has(w.label)) {
      try {
        await w.close();
      } catch (_) {}
    }
  }
  if (enabled.length > 0) {
    const setup = all.find((w) => w.label === "setup");
    if (setup) {
      try {
        await setup.close();
      } catch (_) {}
    }
  }
}

async function saveSettings() {
  config.refreshMinutes = Math.max(
    1,
    parseInt(document.getElementById("refresh-input").value, 10) || 30,
  );
  config.lang = lang;
  try {
    await invoke("save_config", { config });
  } catch (e) {
    document.getElementById("add-msg").textContent = t("saveFail") + e;
    return;
  }
  // 立刻切回视图;窗口同步后台跑(不 await),数据由 config-changed 统一刷新 → 不卡
  if (sourceId && config.sources.some((s) => s.id === sourceId && s.enabled)) {
    setState("list");
  }
  syncWindows();
}

// ---------- 自动刷新 ----------
function resetTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  const ms = Math.max(1, config.refreshMinutes) * 60 * 1000;
  refreshTimer = setInterval(async () => {
    if (isCanvasBall()) await autoSyncCanvas();
    await refresh();
  }, ms);
}

// ---------- 拖动 vs 点击 ----------
function makeDragClick(el, onClick) {
  let dx = 0,
    dy = 0,
    moved = false,
    dragging = false;
  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    dx = e.clientX;
    dy = e.clientY;
    moved = false;
    dragging = false;
  });
  el.addEventListener("mousemove", (e) => {
    if (e.buttons !== 1 || dragging) return;
    if (Math.abs(e.clientX - dx) > 4 || Math.abs(e.clientY - dy) > 4) {
      moved = true;
      dragging = true;
      appWindow.startDragging();
    }
  });
  el.addEventListener("mouseup", (e) => {
    if (e.button !== 0 || moved) return;
    onClick();
  });
}

// ---------- 位置持久化 ----------
async function setupPosition() {
  try {
    const p = await invoke("get_position", { label: LABEL });
    if (p) await appWindow.setPosition(new PhysicalPosition(p[0], p[1]));
  } catch (e) {
    console.error("restore position failed:", e);
  }
  let timer = null;
  await appWindow.onMoved(({ payload }) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      invoke("save_position", { label: LABEL, x: payload.x, y: payload.y }).catch(
        () => {},
      );
    }, 400);
  });
}

// ---------- Canvas 自动完成 ----------
// 补全 scheme、取 origin(扔掉多余路径);填得不对返回 null
function normOrigin(u) {
  try {
    return new URL(u.includes("://") ? u : "https://" + u).origin;
  } catch (_) {
    return null;
  }
}
function canvasBase() {
  // 当前球本身就是 canvas-api 源 → 优先用它自己的网址,保证登录窗和拉数据指向同一学校
  const me = (config.sources || []).find((s) => s.id === sourceId);
  if (me && me.kind === "canvas-api") {
    const o = normOrigin(me.url);
    if (o) return o;
  }
  // 否则取第一个 Canvas 源的网址
  const c = (config.sources || []).find((s) => s.kind === "canvas" || s.kind === "canvas-api");
  return c ? normOrigin(c.url) : null;
}
// 登录是在另一个窗口完成的,收不到完成信号 → 打开登录后轮询几次,拉到数据就停
async function loginAndPoll() {
  const base = canvasBase();
  if (!base) return;
  try {
    await invoke("open_canvas_login", { baseUrl: base });
  } catch (_) {
    return;
  }
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    await refresh();
    if (Array.isArray(items)) break; // 成功(拿到数组)就停
  }
}
function isCanvasBall() {
  const me = (config.sources || []).find((s) => s.id === sourceId);
  return !!(me && me.kind === "canvas");
}
// 静默自动同步:从任意窗口读已存的登录 cookie,标记已交作业完成
async function autoSyncCanvas() {
  const base = canvasBase();
  if (!base) return;
  try {
    await invoke("canvas_autosync", { baseUrl: base });
  } catch (_) {
    /* 未登录 / 离线 → 静默忽略 */
  }
}

async function reloadConfig() {
  try {
    config = await invoke("get_config");
  } catch (e) {
    console.error("get_config failed:", e);
  }
  lang = config.lang || "zh";
}

// ---------- 初始化 ----------
window.addEventListener("DOMContentLoaded", async () => {
  makeDragClick(document.getElementById("ball"), () => setState("list"));
  // 顶栏只负责拖动;收起用 ← 按钮
  makeDragClick(document.getElementById("card-header"), () => {});

  const gear = document.getElementById("gear");
  ["mousedown", "mouseup", "click"].forEach((ev) =>
    gear.addEventListener(ev, (e) => e.stopPropagation()),
  );
  gear.addEventListener("click", () => {
    renderSettings();
    setState("settings");
  });

  const help = document.getElementById("help");
  ["mousedown", "mouseup", "click"].forEach((ev) =>
    help.addEventListener(ev, (e) => e.stopPropagation()),
  );
  help.addEventListener("click", openGuide);

  const collapse = document.getElementById("collapse");
  ["mousedown", "mouseup", "click"].forEach((ev) =>
    collapse.addEventListener(ev, (e) => e.stopPropagation()),
  );
  collapse.addEventListener("click", () => setState("ball"));

  document.getElementById("settings-back").addEventListener("click", () => setState("list"));
  document.getElementById("settings-save").addEventListener("click", saveSettings);
  document.getElementById("open-guide").addEventListener("click", openGuide);
  document.getElementById("guide-back").addEventListener("click", () => setState(guideFrom));
  document.getElementById("add-test").addEventListener("click", testSource);
  document.getElementById("add-btn").addEventListener("click", addSource);

  // 选 "Canvas(登录免ICS)" 时,URL 框提示改成填 Canvas 网址而非 ICS 链接
  document.getElementById("add-kind").addEventListener("change", (e) => {
    const urlEl = document.getElementById("add-url");
    const key = e.target.value === "canvas-api" ? "canvasUrlPh" : "urlPh";
    urlEl.setAttribute("data-i18n-ph", key);
    urlEl.placeholder = t(key);
  });

  // Canvas 自动完成:按钮
  document.getElementById("canvas-login-btn").addEventListener("click", async () => {
    const base = canvasBase();
    const msg = document.getElementById("canvas-msg");
    if (!base) {
      msg.textContent = t("needCanvas");
      return;
    }
    try {
      await invoke("open_canvas_login", { baseUrl: base });
      msg.textContent = "在弹出的窗口里登录,然后点「测试连接」";
    } catch (e) {
      msg.textContent = "打开失败:" + e;
    }
  });
  document.getElementById("canvas-test-btn").addEventListener("click", async () => {
    const base = canvasBase();
    const msg = document.getElementById("canvas-msg");
    if (!base) {
      msg.textContent = t("needCanvas");
      return;
    }
    msg.textContent = "测试中…";
    try {
      const json = await invoke("canvas_api", {
        baseUrl: base,
        path: "/api/v1/users/self",
      });
      const u = JSON.parse(json);
      msg.textContent = "✓ 已登录:" + (u.name || u.short_name || "ok");
      await refresh(); // 登录通了就顺手把这个球填上(免 ICS 球否则会停在「去登录」)
    } catch (e) {
      msg.textContent = "✗ " + e;
    }
  });
  document.getElementById("canvas-sync-btn").addEventListener("click", async () => {
    const base = canvasBase();
    const msg = document.getElementById("canvas-msg");
    if (!base) {
      msg.textContent = t("needCanvas");
      return;
    }
    // 没有 ICS-canvas 源时,canvas_autosync 写的 assignment:<id> 对 canvas-api 球无效
    // (它的完成由后端内联处理)→ 刷新一下就够了,别报「标记了 N 个」误导用户
    const hasIcsCanvas = (config.sources || []).some((s) => s.kind === "canvas");
    if (!hasIcsCanvas) {
      await refresh();
      msg.textContent = t("refreshed");
      return;
    }
    msg.textContent = "同步中…";
    try {
      const n = await invoke("canvas_autosync", { baseUrl: base });
      msg.textContent = `✓ 同步完成,标记了 ${n} 个新完成`;
      await refresh();
    } catch (e) {
      msg.textContent = "✗ " + e;
    }
  });
  document.getElementById("lang-select").addEventListener("change", (e) => {
    lang = e.target.value;
    config.lang = lang;
    applyLang();
  });

  await setupPosition();
  await reloadConfig();
  applyLang();
  resetTimer();
  await refresh();
  if (isCanvasBall()) {
    await autoSyncCanvas(); // 启动时自动同步一次(用已存登录态)
    await refresh();
  }
  setInterval(tick, 1000);

  await listen("config-changed", async () => {
    await reloadConfig();
    applyLang();
    resetTimer();
    await refresh();
  });

  if (sourceId === null) {
    renderSettings();
    await setState("settings");
  } else {
    await setState("ball");
  }
});
