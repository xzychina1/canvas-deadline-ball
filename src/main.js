const { invoke } = window.__TAURI__.core;
const { getCurrentWindow, LogicalSize, PhysicalPosition } = window.__TAURI__.window;
const { listen } = window.__TAURI__.event;
const { WebviewWindow, getAllWebviewWindows } = window.__TAURI__.webviewWindow;
const appWindow = getCurrentWindow();

const SIZES = { ball: [130, 130], list: [320, 460], settings: [360, 560] };

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
    testOk: (n) => `✓ 成功,解析到 ${n} 个事件`,
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
    testOk: (n) => `✓ OK — parsed ${n} events`,
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
  const ls = document.getElementById("lang-select");
  if (ls) ls.value = lang;
  applyIdentity();
  renderBallAndList();
  renderSettings();
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
  try {
    items = await invoke("get_source_deadlines", { sourceId });
  } catch (e) {
    console.error("get_source_deadlines failed:", e);
    items = null;
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
  } else if (items.length === 0) {
    text = "--:--:--";
  } else {
    const remaining = items[0].dueMs - Date.now();
    text = remaining <= 0 ? "00:00:00" : fmtCountdown(remaining);
    if (remaining <= 0) refresh(); // 过期了重拉,后端会把它移出
  }
  let col;
  if (items === null) col = "#e2503b";
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
  document.getElementById("gear").hidden = s !== "list";
  document.getElementById("collapse").hidden = s !== "list";
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
    const n = await invoke("test_source", { url, kind });
    msg.textContent = t("testOk")(n);
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
  config.sources.push({ id: crypto.randomUUID(), name, kind, url, color, enabled: true });
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
  refreshTimer = setInterval(refresh, ms);
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

  const collapse = document.getElementById("collapse");
  ["mousedown", "mouseup", "click"].forEach((ev) =>
    collapse.addEventListener(ev, (e) => e.stopPropagation()),
  );
  collapse.addEventListener("click", () => setState("ball"));

  document.getElementById("settings-back").addEventListener("click", () => setState("list"));
  document.getElementById("settings-save").addEventListener("click", saveSettings);
  document.getElementById("add-test").addEventListener("click", testSource);
  document.getElementById("add-btn").addEventListener("click", addSource);

  // Canvas 自动完成(实验):开登录窗 + 测试认证
  const canvasBase = () => {
    const c = (config.sources || []).find((s) => s.kind === "canvas");
    try {
      return c ? new URL(c.url).origin : null;
    } catch (_) {
      return null;
    }
  };
  document.getElementById("canvas-login-btn").addEventListener("click", async () => {
    const base = canvasBase();
    const msg = document.getElementById("canvas-msg");
    if (!base) {
      msg.textContent = "先添加一个 Canvas 源";
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
      msg.textContent = "先添加一个 Canvas 源";
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
    } catch (e) {
      msg.textContent = "✗ " + e;
    }
  });
  document.getElementById("canvas-sync-btn").addEventListener("click", async () => {
    const base = canvasBase();
    const msg = document.getElementById("canvas-msg");
    if (!base) {
      msg.textContent = "先添加一个 Canvas 源";
      return;
    }
    msg.textContent = "同步中…";
    try {
      const n = await invoke("canvas_sync_done", { baseUrl: base });
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
