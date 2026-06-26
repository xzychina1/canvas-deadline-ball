const { invoke } = window.__TAURI__.core;
const { getCurrentWindow, LogicalSize } = window.__TAURI__.window;
const { listen } = window.__TAURI__.event;
const { WebviewWindow, getAllWebviewWindows } = window.__TAURI__.webviewWindow;
const appWindow = getCurrentWindow();

const SIZES = { ball: [100, 100], list: [300, 420], settings: [340, 520] };

// 本窗口代表哪个源:标签 "ball::<id>" → id;"setup" → null(无源,直接开设置)
const LABEL = appWindow.label;
const sourceId = LABEL.startsWith("ball::") ? LABEL.slice("ball::".length) : null;

let items = []; // 当前 ddl(null = 出错)
let config = { sources: [], windowDays: 7, refreshMinutes: 30 };
let state = "ball";
let refreshTimer = null;

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
    return;
  }
  try {
    items = await invoke("get_source_deadlines", { sourceId });
  } catch (e) {
    console.error("get_source_deadlines failed:", e);
    items = null;
  }
  renderBallAndList();
}

function renderBallAndList() {
  const countEl = document.getElementById("count");
  const labelEl = document.getElementById("label");
  const cardCount = document.getElementById("card-count");
  const listEl = document.getElementById("list");

  if (items === null) {
    countEl.textContent = "!";
    labelEl.textContent = "出错";
    cardCount.textContent = "!";
    listEl.innerHTML = '<div class="empty">拉取出错,检查设置里的链接</div>';
    return;
  }

  countEl.textContent = String(items.length);
  labelEl.textContent = items.length > 0 ? items[0].due.split(" ")[0] : "无ddl";
  cardCount.textContent = String(items.length);

  listEl.innerHTML = "";
  if (items.length === 0) {
    listEl.innerHTML = '<div class="empty">未来 7 天没有 ddl 🎉</div>';
    return;
  }
  for (const it of items) {
    const row = document.createElement("div");
    row.className = "item";
    row.style.borderLeftColor = it.color || "#e23b3b";
    const tag = it.course && it.course.length ? it.course : it.source;
    row.innerHTML =
      `<div class="when">${esc(it.due)}</div>` +
      `<div class="what"><span class="tag" style="color:${esc(it.color)}">${esc(tag)}</span>${esc(it.title)}</div>`;
    if (it.url) row.addEventListener("click", () => invoke("open_url", { url: it.url }));
    else row.style.cursor = "default";
    listEl.appendChild(row);
  }
}

// 用本源的颜色 + 名字装扮这个球
function applyIdentity() {
  const me = (config.sources || []).find((s) => s.id === sourceId);
  const color = me ? me.color : "#e23b3b";
  const name = me ? me.name : "未来 7 天";
  document.getElementById("ball").style.background =
    `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.35), ${color})`;
  document.getElementById("card-header").style.background = color;
  document.getElementById("header-name").textContent = name;
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
}

// ---------- 设置面板(编辑全局配置) ----------
function renderSettings() {
  document.getElementById("refresh-input").value = config.refreshMinutes;
  const wrap = document.getElementById("source-list");
  wrap.innerHTML = "";
  if (!config.sources.length) {
    wrap.innerHTML = '<div class="empty">还没有源,下面添加一个</div>';
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
    chk.title = "启用";
    chk.addEventListener("change", () => {
      config.sources[i].enabled = chk.checked;
    });
    const del = document.createElement("button");
    del.textContent = "🗑";
    del.className = "del";
    del.title = "删除";
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
    msg.textContent = "先填链接";
    return;
  }
  msg.textContent = "测试中…";
  try {
    const n = await invoke("test_source", { url, kind });
    msg.textContent = `✓ 成功,解析到 ${n} 个事件`;
  } catch (e) {
    msg.textContent = "✗ 失败:" + e;
  }
}

function addSource() {
  const name = document.getElementById("add-name").value.trim();
  const url = document.getElementById("add-url").value.trim();
  const kind = document.getElementById("add-kind").value;
  const color = document.getElementById("add-color").value;
  const msg = document.getElementById("add-msg");
  if (!name || !url) {
    msg.textContent = "名字和链接都要填";
    return;
  }
  config.sources.push({
    id: crypto.randomUUID(),
    name,
    kind,
    url,
    color,
    enabled: true,
  });
  document.getElementById("add-name").value = "";
  document.getElementById("add-url").value = "";
  msg.textContent = "已添加,记得点保存";
  renderSettings();
}

// JS 端同步窗口集合(Windows 上从命令线程建窗会冻死 UI,所以放前端用异步 API)
async function syncWindows() {
  const enabled = (config.sources || []).filter((s) => s.enabled);
  const desired = new Set(enabled.map((s) => "ball::" + s.id));
  const all = await getAllWebviewWindows();
  const existing = new Set(all.map((w) => w.label));

  // 先建缺失的球
  enabled.forEach((s, i) => {
    const label = "ball::" + s.id;
    if (!existing.has(label)) {
      new WebviewWindow(label, {
        url: "index.html",
        width: 100,
        height: 100,
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

  // 再关多余的(可能含自己,放最后)
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
  try {
    await invoke("save_config", { config }); // 只存盘 + 广播
  } catch (e) {
    document.getElementById("add-msg").textContent = "保存失败:" + e;
    return;
  }
  await syncWindows(); // JS 端建/关窗口(不死锁)
  await refresh();
  if (sourceId && config.sources.some((s) => s.id === sourceId && s.enabled)) {
    await setState("list");
  }
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

// ---------- 初始化 ----------
async function reloadConfig() {
  try {
    config = await invoke("get_config");
  } catch (e) {
    console.error("get_config failed:", e);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  makeDragClick(document.getElementById("ball"), () => setState("list"));
  makeDragClick(document.getElementById("card-header"), () => {
    if (state === "list") setState("ball");
  });

  const gear = document.getElementById("gear");
  ["mousedown", "mouseup", "click"].forEach((ev) =>
    gear.addEventListener(ev, (e) => e.stopPropagation()),
  );
  gear.addEventListener("click", () => {
    renderSettings();
    setState("settings");
  });

  document
    .getElementById("settings-back")
    .addEventListener("click", () => setState("list"));
  document
    .getElementById("settings-save")
    .addEventListener("click", saveSettings);
  document.getElementById("add-test").addEventListener("click", testSource);
  document.getElementById("add-btn").addEventListener("click", addSource);

  await reloadConfig();
  applyIdentity();
  resetTimer();
  await refresh();

  // 任何窗口保存配置后,所有球重载
  await listen("config-changed", async () => {
    await reloadConfig();
    applyIdentity();
    resetTimer();
    await refresh();
  });

  if (sourceId === null) {
    renderSettings();
    await setState("settings"); // setup 窗口:直接开设置
  } else {
    await setState("ball");
  }
});
