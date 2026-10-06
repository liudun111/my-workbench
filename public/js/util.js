/* ============================================================
   通用工具
   ============================================================ */
export function qs(s, r) { return (r || document).querySelector(s); }
export function qsa(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
export function attr(s) { return esc(s); }
export function fmt(tpl, o) {
  if (!o) return tpl;
  var out = tpl;
  for (var k in o) {
    if (Object.prototype.hasOwnProperty.call(o, k)) out = out.split("@{" + k + "}").join(o[k] == null ? "" : String(o[k]));
  }
  return out;
}
export function pad2(n) { return n < 10 ? "0" + n : "" + n; }
export function parseDate(s) {
  var p = String(s || "").split("-");
  return new Date(Number(p[0]) || 1970, (Number(p[1]) || 1) - 1, Number(p[2]) || 1);
}
export function fmtDate(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
export function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
export function diffDays(a, b) {
  return Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}
export function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
export function todayStr() { return fmtDate(today()); }
export function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
export function debounce(fn, ms) {
  var t = null;
  return function () {
    var a = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(self, a); }, ms || 250);
  };
}
export function bytes(n) {
  var v = Number(n) || 0;
  if (v < 1024) return v + " B";
  if (v < 1048576) return (Math.round(v / 1024 * 10) / 10) + " KB";
  return (Math.round(v / 1048576 * 10) / 10) + " MB";
}
export function relTime(s) {
  if (!s) return "";
  var d = new Date(String(s).split(" ").join("T"));
  var diff = (Date.now() - d.getTime()) / 1000;
  if (!isFinite(diff)) return s;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
  if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
  if (diff < 86400 * 30) return Math.floor(diff / 86400) + " 天前";
  return String(s).slice(0, 10);
}
export function greeting() {
  var h = new Date().getHours();
  if (h < 5) return "夜深了";
  if (h < 9) return "早上好";
  if (h < 12) return "上午好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  if (h < 23) return "晚上好";
  return "夜深了";
}

/* ---------------- 元数据 ---------------- */
export var STATUS = {
  todo: { t: "待办", c: "#938CAC" },
  doing: { t: "进行中", c: "#F5A623" },
  done: { t: "已完成", c: "#2FB88A" },
  paused: { t: "搁置", c: "#3AB8DC" }
};
export var PRIORITY = {
  high: { t: "高", c: "#F0604D" },
  medium: { t: "中", c: "#7C5CFF" },
  low: { t: "低", c: "#938CAC" }
};
export var PSTATUS = {
  planning: { t: "计划中", c: "#7C5CFF" },
  active: { t: "进行中", c: "#2FB88A" },
  paused: { t: "搁置", c: "#F5A623" },
  done: { t: "已完成", c: "#3AB8DC" }
};
export var TYPES = { task: { t: "任务" }, group: { t: "阶段" }, milestone: { t: "里程碑" } };

export var COLORS = ["#7C5CFF", "#FF7A9A", "#3ECFA0", "#FFB020", "#4CC3F0", "#FF8A5C", "#B07CFF", "#F45B9B", "#2FBFA8", "#6B7BFF"];

export var EMOJIS = ["📁", "🚀", "🎨", "📖", "✈️", "💡", "🏠", "💪", "🎵", "📷", "🌱", "🍀", "🔥", "⭐", "🌙", "☀️",
  "🧩", "🎯", "📦", "🛠", "🧪", "📊", "🎬", "🍰", "🐣", "🌊", "🏔", "🎓", "💼", "🧸", "🪴", "🎁",
  "🔮", "🧭", "📝", "🖥", "📱", "🎧", "🚴", "🏃", "🍜", "🧳", "🗓", "💾"];


/* ---------------- 自动配色 ---------------- */
var FAMILIES = [
  { h: 258, s: 74, l: 55 },
  { h: 340, s: 78, l: 56 },
  { h: 160, s: 64, l: 40 },
  { h: 42, s: 90, l: 47 },
  { h: 200, s: 80, l: 45 },
  { h: 285, s: 68, l: 57 },
  { h: 322, s: 76, l: 58 },
  { h: 176, s: 64, l: 38 },
  { h: 228, s: 78, l: 55 },
  { h: 100, s: 52, l: 40 }
];
var MILESTONE_COLOR = "#F2694F";
var LIGHT_STEPS = [0, -9, 8, -5, 5, -13, 13];
function hsl(h, s, l) { return "hsl(" + h + ", " + s + "%, " + l + "%)"; }
function shade(base, depth, idx) {
  var l = base.l + LIGHT_STEPS[(idx + depth) % LIGHT_STEPS.length] + Math.min(depth - 1, 2) * 3;
  l = Math.max(32, Math.min(70, l));
  var s = Math.max(36, base.s - Math.min(depth, 3) * 4);
  return hsl(base.h, s, l);
}

/* 按层级自动分配配色：顶层阶段各占一个色系，子任务用同色系深浅区分 */
export function buildAutoColors(tasks) {
  var kids = {};
  (tasks || []).forEach(function (t) {
    var p = t.parent_id == null ? "root" : t.parent_id;
    if (!kids[p]) kids[p] = [];
    kids[p].push(t);
  });
  var map = {};
  var family = 0;
  function walk(pid, base, depth) {
    var list = kids[pid] || [];
    list.forEach(function (t, idx) {
      if (t.type === "milestone") {
        map[t.id] = MILESTONE_COLOR;
        walk(t.id, base, depth + 1);
        return;
      }
      var b = base;
      if (depth === 0) {
        b = FAMILIES[family % FAMILIES.length];
        family++;
        map[t.id] = hsl(b.h, b.s, b.l);
      } else {
        map[t.id] = shade(b, depth, idx);
      }
      walk(t.id, b, depth + 1);
    });
  }
  walk("root", FAMILIES[0], 0);
  return map;
}

export function resolveColor(t, autoMap) {
  if (t.color_mode === "manual" && t.color) return t.color;
  return (autoMap && autoMap[t.id]) || t.color || "#7C5CFF";
}
export function statusChip(s) {
  var m = STATUS[s] || STATUS.todo;
  var cls = s === "done" ? "green" : (s === "doing" ? "amber" : (s === "paused" ? "" : "gray"));
  return fmt('<span class="chip @{cls}">@{t}</span>', { cls: cls, t: m.t });
}
export function pstatusChip(s) {
  var m = PSTATUS[s] || PSTATUS.planning;
  var cls = s === "active" ? "green" : (s === "paused" ? "amber" : (s === "done" ? "" : ""));
  return fmt('<span class="chip @{cls}">@{t}</span>', { cls: cls, t: m.t });
}

/* ---------------- 文件 ---------------- */
export function fileIcon(name, mime) {
  var ext = String(name || "").toLowerCase().split(".").pop();
  var m = String(mime || "");
  if (m.indexOf("image/") === 0) return { e: "🖼", c: "#4CC3F0" };
  if (m.indexOf("video/") === 0) return { e: "🎬", c: "#F45B9B" };
  if (m.indexOf("audio/") === 0) return { e: "🎵", c: "#B07CFF" };
  if (ext === "pdf") return { e: "📕", c: "#F0604D" };
  if (ext === "zip" || ext === "rar" || ext === "7z" || ext === "gz") return { e: "🗜", c: "#FFB020" };
  if (ext === "doc" || ext === "docx" || ext === "pages") return { e: "📘", c: "#4CC3F0" };
  if (ext === "xls" || ext === "xlsx" || ext === "csv" || ext === "numbers") return { e: "📗", c: "#2FB88A" };
  if (ext === "ppt" || ext === "pptx" || ext === "key") return { e: "📙", c: "#FF8A5C" };
  if (ext === "md" || ext === "txt" || ext === "rtf") return { e: "📄", c: "#7C5CFF" };
  if (ext === "js" || ext === "ts" || ext === "json" || ext === "html" || ext === "css" || ext === "py" || ext === "java" || ext === "go" || ext === "rs") return { e: "🧩", c: "#3ECFA0" };
  return { e: "📎", c: "#938CAC" };
}
export function extLabel(name) {
  var parts = String(name || "").split(".");
  if (parts.length < 2) return "FILE";
  return parts.pop().toUpperCase().slice(0, 4);
}

/* ---------------- 提示 ---------------- */
export function toast(msg, type) {
  var root = qs("#toastRoot");
  if (!root) return;
  var el = document.createElement("div");
  el.className = "toast " + (type === "success" ? "ok" : (type === "error" ? "err" : (type === "warn" ? "warn" : "")));
  var icons = { success: "✅", error: "⛔", warn: "⚠️", info: "✨" };
  el.innerHTML = fmt('<span>@{i}</span><span>@{m}</span>', { i: icons[type] || icons.info, m: esc(msg) });
  root.appendChild(el);
  setTimeout(function () {
    el.style.transition = "opacity .25s, transform .25s";
    el.style.opacity = "0";
    el.style.transform = "translateX(18px)";
    setTimeout(function () { el.remove(); }, 260);
  }, type === "error" ? 3800 : 2400);
}

/* ---------------- 模态框 ---------------- */
export function openModal(cardHtml, opts) {
  opts = opts || {};
  var root = qs("#modalRoot");
  var mask = document.createElement("div");
  mask.className = "mask";
  mask.innerHTML = cardHtml;
  root.appendChild(mask);
  var done = false;
  function close() {
    if (done) return;
    done = true;
    document.removeEventListener("keydown", onKey);
    mask.remove();
    if (opts.onClose) opts.onClose();
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  mask.addEventListener("mousedown", function (e) { if (e.target === mask && !opts.sticky) close(); });
  qsa("[data-close]", mask).forEach(function (b) { b.addEventListener("click", close); });
  document.addEventListener("keydown", onKey);
  mask.__close = close;
  return mask;
}
export function closeModal(m) { if (m && m.__close) m.__close(); }

export function confirmDialog(o) {
  o = o || {};
  return new Promise(function (resolve) {
    var settled = false;
    var mask = openModal(
      '<div class="modal narrow"><div class="mhead"><h3>' + esc(o.title || "确认一下") + '</h3></div>' +
      '<div class="mbody"><p style="margin:0;font-size:13.5px;line-height:1.85;color:var(--text-2)">' + esc(o.message || "") + '</p></div>' +
      '<div class="mfoot"><span class="spacer"></span><button class="btn" data-close>取消</button>' +
      '<button class="btn ' + (o.danger ? "danger" : "primary") + '" data-ok>' + esc(o.okText || "确定") + '</button></div></div>',
      { onClose: function () { if (!settled) { settled = true; resolve(false); } } }
    );
    qs("[data-ok]", mask).addEventListener("click", function () { settled = true; mask.__close(); resolve(true); });
  });
}

export function download(url) {
  var a = document.createElement("a");
  a.href = url;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { a.remove(); }, 600);
}

export function emptyState(emoji, title, desc, action) {
  return '<div class="empty"><div class="e">' + emoji + '</div><b>' + esc(title) + '</b><div class="small">' + esc(desc || "") + '</div>' + (action || "") + '</div>';
}
