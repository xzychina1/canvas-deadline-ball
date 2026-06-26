const { invoke } = window.__TAURI__.core;
const { getCurrentWindow, LogicalSize } = window.__TAURI__.window;
const appWindow = getCurrentWindow();

const COLLAPSED = [100, 100];
const EXPANDED = [300, 420];

let items = []; // 当前作业列表(null = 出错)
let expanded = false;

// ---- 拉数据 + 渲染 ----
async function refresh() {
  try {
    items = await invoke("get_deadlines");
  } catch (e) {
    console.error("get_deadlines failed:", e);
    items = null;
  }
  render();
}

function render() {
  const countEl = document.getElementById("count");
  const labelEl = document.getElementById("label");
  const cardCount = document.getElementById("card-count");
  const listEl = document.getElementById("list");

  if (items === null) {
    countEl.textContent = "!";
    labelEl.textContent = "出错";
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
    row.innerHTML =
      `<div class="when">${escapeHtml(it.due)}</div>` +
      `<div class="what"><span class="course">${escapeHtml(it.course)}</span>${escapeHtml(it.title)}</div>`;
    row.addEventListener("click", () => invoke("open_url", { url: it.url }));
    listEl.appendChild(row);
  }
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

// ---- 展开 / 收起 ----
async function setExpanded(v) {
  expanded = v;
  const [w, h] = expanded ? EXPANDED : COLLAPSED;
  await appWindow.setSize(new LogicalSize(w, h));
  document.getElementById("ball").hidden = expanded;
  document.getElementById("card").hidden = !expanded;
}

// ---- 手动区分「拖动」与「点击」----
// 按住移动超过阈值 = 拖窗;原地按下松开 = 点击
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

window.addEventListener("DOMContentLoaded", () => {
  makeDragClick(document.getElementById("ball"), () => setExpanded(true));
  makeDragClick(document.getElementById("card-header"), () => setExpanded(false));
  refresh();
});
