const { invoke } = window.__TAURI__.core;
const { getCurrentWindow, LogicalSize } = window.__TAURI__.window;
const appWindow = getCurrentWindow();

const SIZES = { ball: [100, 100], list: [300, 420], settings: [340, 520] };

let items = []; // 当前 ddl 列表(null = 出错)
let config = { sources: [], windowDays: 7, refreshMinutes: 30 };
let state = "ball";
let refreshTimer = null;

function esc(s) {
  return String(s == null ? "" : s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

// ---------- 数据 ----------
async function refresh() {
  try {
    items = await invoke("get_deadlines");
  } catch (e) {
    console.error("get_deadlines failed:", e);
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

// ---------- 视图状态(ball / list / settings) ----------
async function setState(s) {
  state = s;
  await appWindow.setSize(new LogicalSize(...SIZES[s]));
  document.getElementById("ball").hidden = s !== "ball";
  document.getElementById("card").hidden = s === "ball";
  document.getElementById("list-view").hidden = s !== "list";
  document.getElementById("settings-view").hidden = s !== "settings";
  document.getElementById("gear").hidden = s !== "list";
}

// ---------- 设置面板 ----------
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

async function saveSettings() {
  config.refreshMinutes = Math.max(
    1,
    parseInt(document.getElementById("refresh-input").value, 10) || 30,
  );
  try {
    await invoke("save_config", { config });
  } catch (e) {
    document.getElementById("add-msg").textContent = "保存失败:" + e;
    return;
  }
  resetTimer();
  await refresh();
  await setState("list");
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
window.addEventListener("DOMContentLoaded", async () => {
  makeDragClick(document.getElementById("ball"), () => setState("list"));
  makeDragClick(document.getElementById("card-header"), () => {
    if (state === "list") setState("ball");
  });

  // 齿轮:打开设置(阻止冒泡到 header 的拖动/折叠)
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

  // 加载配置
  try {
    config = await invoke("get_config");
  } catch (e) {
    console.error("get_config failed:", e);
  }
  resetTimer();
  await refresh();

  // 首次运行没有源 → 直接打开设置
  if (!config.sources || config.sources.length === 0) {
    renderSettings();
    await setState("settings");
  } else {
    await setState("ball");
  }
});
