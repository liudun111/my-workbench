/* ============================================================
   我的工作台 · 前端主程序
   ============================================================ */
import {
  qs, qsa, esc, attr, fmt, parseDate, fmtDate, addDays, diffDays, today, todayStr,
  clamp, debounce, bytes, relTime, greeting, toast, openModal, closeModal, confirmDialog,
  download, emptyState, statusChip, pstatusChip, fileIcon, extLabel,
  STATUS, PRIORITY, PSTATUS, TYPES, COLORS, EMOJIS, buildAutoColors, resolveColor
} from "./util.js";
import { state, get, post, put, del, uploadFile } from "./api.js";
import { ring, donut, hbars, vbars, stacked } from "./charts.js";
import { createGantt } from "./gantt.js";

var ganttComp = null;

/* ---------------- 外观 ---------------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t === "dark" ? "dark" : "light";
  try { localStorage.setItem("wb-theme", t); } catch (e) { }
}
function themeNow() {
  try { return localStorage.getItem("wb-theme") || state.settings.theme || "light"; } catch (e) { return "light"; }
}
function applyAccent(c) {
  document.documentElement.style.setProperty("--accent", c || "#7C5CFF");
}

/* ---------------- 启动 ---------------- */
async function boot() {
  applyTheme(themeNow());
  try {
    var data = await get("/api/state");
    state.settings = data.settings || {};
    state.projects = data.projects || [];
    state.stats = data.stats;
    applyAccent(state.settings.accent);
    qs("#boot").hidden = true;
    qs("#app").hidden = false;
    renderShell();
    router();
  } catch (e) {
    qs("#boot").innerHTML = '<div class="empty"><div class="e">🔌</div><b>无法连接本地服务</b><div class="small">' + esc(e.message) + '</div></div>';
  }
}

async function reloadAll() {
  var d = await get("/api/state");
  state.settings = d.settings || {};
  state.projects = d.projects || [];
  state.stats = d.stats;
  applyAccent(state.settings.accent);
}

async function openProject(id) {
  var d = await get("/api/projects/" + id);
  state.project = d.project;
  state.tasks = d.tasks || [];
  state.links = d.links || [];
  state.attachments = d.attachments || [];
  computeColors();
  return d;
}
async function refreshProject() {
  if (!state.project) return;
  var d = await get("/api/projects/" + state.project.id);
  state.project = d.project;
  state.tasks = d.tasks || [];
  state.links = d.links || [];
  state.attachments = d.attachments || [];
  computeColors();
  if (ganttComp) ganttComp.setData(state.tasks, state.links, state.attachments);
}
function projectById(id) {
  for (var i = 0; i < state.projects.length; i++) if (state.projects[i].id === id) return state.projects[i];
  return null;
}
function taskById(id) {
  for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === id) return state.tasks[i];
  return null;
}
function computeColors() { state.autoColors = buildAutoColors(state.tasks); }
function colorOf(t) { return resolveColor(t, state.autoColors); }

function childrenOfId(id) { return state.tasks.filter(function (x) { return x.parent_id === id; }); }
function descendantIds(id) {
  var out = [], stack = [id];
  while (stack.length) {
    var cur = stack.pop();
    childrenOfId(cur).forEach(function (c) { out.push(c.id); stack.push(c.id); });
  }
  return out;
}
function spanOfTask(t) {
  var kids = childrenOfId(t.id);
  if (t.type === "group" && kids.length) {
    var s = null, e = null;
    kids.forEach(function (k) {
      var sp = spanOfTask(k);
      if (s === null || sp[0] < s) s = sp[0];
      if (e === null || sp[1] > e) e = sp[1];
    });
    return [s, e];
  }
  var a = parseDate(t.start_date), b = parseDate(t.end_date);
  if (b < a) b = a;
  return [a, b];
}

function ensureProject() {
  if (!state.projects.length) { state.project = null; return false; }
  var ok = state.project && projectById(state.project.id);
  if (!ok) { state.project = state.projects[0]; return true; }
  return false;
}

/* ---------------- 导航 ---------------- */
var NAV = [
  { k: "overview", e: "🏡", t: "概览", g: "我的空间" },
  { k: "projects", e: "📁", t: "项目", g: "我的空间" },
  { k: "gantt", e: "📅", t: "甘特图", g: "规划" },
  { k: "board", e: "🗂", t: "看板", g: "规划" },
  { k: "files", e: "📎", t: "资料库", g: "收藏" },
  { k: "settings", e: "⚙️", t: "设置", g: "收藏" }
];

function renderShell() {
  var s = state.settings;
  document.title = s.app_name || "我的工作台";
  qs("#me").innerHTML =
    '<span class="ava">' + esc(s.avatar || "🌱") + '</span>' +
    '<span class="who"><b>' + esc(s.nickname || "我的") + '</b><span>' + esc(s.app_name || "我的工作台") + '</span></span>';
  qs("#me").onclick = function () { state.view = "settings"; renderShell(); router(); };

  var html = "", lastG = "";
  NAV.forEach(function (n) {
    if (n.g !== lastG) { html += '<div class="nav-label">' + n.g + '</div>'; lastG = n.g; }
    html += fmt('<button class="nav-item@{a}" data-nav="@{k}"><i>@{e}</i><span>@{t}</span></button>',
      { a: state.view === n.k ? " active" : "", k: n.k, e: n.e, t: n.t });
  });
  qs("#nav").innerHTML = html;
  qsa("[data-nav]").forEach(function (b) {
    b.addEventListener("click", function () {
      state.view = b.dataset.nav;
      renderShell();
      router();
    });
  });
  qs("#sideFoot").innerHTML = '<div class="side-tip">数据保存在本机 <b>data/</b> 目录<br>记得偶尔备份一下 🌿</div>';
}

function renderTop(title, sub, actions) {
  qs("#pageTitle").textContent = title;
  qs("#pageSub").textContent = sub || "";
  var themeBtn = '<button class="btn icon" data-top="theme" title="切换主题">' + (themeNow() === "dark" ? "☀️" : "🌙") + '</button>';
  qs("#topActions").innerHTML = (actions || "") + themeBtn;
  qsa("[data-top]", qs("#topActions")).forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.dataset.top === "theme") {
        applyTheme(themeNow() === "dark" ? "light" : "dark");
        renderTop(qs("#pageTitle").textContent, qs("#pageSub").textContent, window.__acts || "");
      }
    });
  });
  window.__acts = actions || "";
}

function projectSelect() {
  if (!state.projects.length) return "";
  ensureProject();
  var opts = state.projects.map(function (p) {
    return '<option value="' + p.id + '"' + (state.project && state.project.id === p.id ? " selected" : "") + '>' + esc(p.emoji + " " + p.name) + '</option>';
  }).join("");
  return '<select class="select" data-top="proj" style="width:auto;min-width:190px">' + opts + '</select>';
}
function bindProjectSelect() {
  var sel = qs("[data-top=proj]");
  if (!sel) return;
  sel.addEventListener("change", async function () {
    await openProject(Number(sel.value));
    router();
  });
}

function router() {
  qsa("[data-nav]").forEach(function (b) { b.classList.toggle("active", b.dataset.nav === state.view); });
  var fn = renderOverview;
  if (state.view === "projects") fn = renderProjects;
  else if (state.view === "gantt") fn = renderGanttView;
  else if (state.view === "board") fn = renderBoard;
  else if (state.view === "files") fn = renderFiles;
  else if (state.view === "settings") fn = renderSettings;
  Promise.resolve().then(function () { return fn(); }).catch(function (e) {
    console.error(e);
    window.__wbError = String((e && e.message) || e);
    toast("页面出错了：" + window.__wbError, "error");
  });
}

/* ============================================================
   概览
   ============================================================ */
function renderOverview() {
  var s = state.stats;
  var st = state.settings;
  renderTop(greeting() + "，" + (st.nickname || "我的") + " " + (st.avatar || "🌱"),
    todayStr() + " · 一点点来，都会做完的",
    '<button class="btn sm" data-top="newproj">＋ 新项目</button>' +
    '<button class="btn sm" data-top="refresh">🔄 刷新</button>');
  var np = qs("[data-top=newproj]"); if (np) np.addEventListener("click", function () { projectModal(null); });
  var rf = qs("[data-top=refresh]"); if (rf) rf.addEventListener("click", async function () { await reloadAll(); router(); toast("已刷新", "success"); });

  if (!s) { qs("#content").innerHTML = emptyState("🌱", "还没有数据", ""); return; }
  var sum = s.summary;

  var hero = '<div class="hero">' +
    '<h2>' + greeting() + '</h2>' +
    '<div class="motto" contenteditable="true" spellcheck="false" id="motto">' + esc(st.home_motto || "把想法拆成今天能做完的一小步。") + '</div>' +
    '<div class="hstats">' +
    '<div><b>' + sum.doing + '</b><span>进行中的任务</span></div>' +
    '<div><b>' + sum.week_done + '</b><span>本周完成</span></div>' +
    '<div><b>' + sum.overdue + '</b><span>逾期</span></div>' +
    '<div><b>' + sum.projects + '</b><span>个项目</span></div>' +
    '<div><b>' + sum.attachments + '</b><span>个附件</span></div>' +
    '</div></div>';

  var focus = (s.focus || []).map(function (t) {
    var p = projectById(t.project_id) || {};
    var pct = Number(t.progress) || 0;
    return '<div class="task-line">' +
      '<div class="pj" style="--c:' + (p.color || "#7C5CFF") + '">' + esc(p.emoji || "📁") + '</div>' +
      '<div class="tx"><b>' + esc(t.name) + '</b><span>' + esc(p.name || "") + ' · 截止 ' + esc(t.end_date) + '</span></div>' +
      '<div class="progress sm" style="width:70px"><i style="width:' + pct + '%;background:' + (p.color || "#7C5CFF") + '"></i></div>' +
      '<div class="acts">' +
      '<button class="btn sm ghost" data-plus="' + t.id + '" title="+10%">+10%</button>' +
      '<button class="btn sm ghost" data-done="' + t.id + '" title="标记完成">✓</button>' +
      '</div></div>';
  }).join("") || '<div class="muted small" style="padding:14px 0">今天没有进行中的任务，享受一下 ✨</div>';

  var dist = [
    { label: "待办", value: s.status_dist.todo || 0, color: "#938CAC" },
    { label: "进行中", value: s.status_dist.doing || 0, color: "#F5A623" },
    { label: "已完成", value: s.status_dist.done || 0, color: "#2FB88A" },
    { label: "搁置", value: s.status_dist.paused || 0, color: "#3AB8DC" }
  ];
  var totalTasks = dist.reduce(function (a, b) { return a + b.value; }, 0);
  var legend = dist.map(function (d) {
    return fmt('<div style="display:flex;align-items:center;gap:9px;font-size:12.5px;padding:5px 0"><i style="width:10px;height:10px;border-radius:3px;background:@{c}"></i><span>@{l}</span><b style="margin-left:auto">@{v}</b></div>',
      { c: d.color, l: d.label, v: d.value });
  }).join("");

  var prog = hbars((s.projects || []).map(function (p) {
    return { label: p.emoji + " " + p.name, value: p.progress, color: p.color };
  }), { max: 100 });

  var milestones = (s.upcoming || []).map(function (t) {
    var p = projectById(t.project_id) || {};
    var d = diffDays(today(), parseDate(t.end_date));
    var label = d < 0 ? "已过期" : (d === 0 ? "就是今天" : (d + " 天后"));
    return '<div class="task-line"><div class="pj" style="--c:' + (t.color || "#7C5CFF") + '">🎯</div>' +
      '<div class="tx"><b>' + esc(t.name) + '</b><span>' + esc(p.name || "") + ' · ' + esc(t.end_date) + '</span></div>' +
      '<span class="chip">' + label + '</span></div>';
  }).join("") || '<div class="muted small" style="padding:14px 0">还没有里程碑，去甘特图加一个吧</div>';

  var recent = (s.recent || []).map(function (t) {
    return '<div class="task-line"><div class="pj" style="--c:' + (t.project_emoji ? "#7C5CFF" : "#938CAC") + '">' + esc(t.project_emoji || "📁") + '</div>' +
      '<div class="tx"><b>' + esc(t.name) + '</b><span>' + esc(t.project_name || "") + '</span></div>' +
      '<span class="muted small">' + esc(relTime(t.updated_at)) + '</span></div>';
  }).join("") || '<div class="muted small">还没有记录</div>';

  qs("#content").innerHTML =
    hero +
    '<div class="grid g4" style="margin:16px 0">' +
    kpi("⏳", "#F5A623", sum.doing, "进行中任务") +
    kpi("✅", "#2FB88A", sum.done, "已完成任务") +
    kpi("🔗", "#7C5CFF", sum.links, "依赖连线") +
    kpi("📎", "#4CC3F0", sum.attachments, "附件资料") +
    '</div>' +
    '<div class="grid" style="grid-template-columns:1.3fr .9fr;margin-bottom:16px">' +
    card("今日焦点", "进行中的任务", '<div style="padding:0 18px 12px">' + focus + '</div>', "") +
    '<div class="card"><div class="card-head"><h3>任务分布</h3><span class="sub">共 ' + totalTasks + ' 项</span></div>' +
    '<div class="card-body" style="display:flex;align-items:center;gap:20px">' + donut(dist, { size: 158, thickness: 20, centerValue: totalTasks, centerLabel: "任务" }) +
    '<div style="flex:1">' + legend + '</div></div></div>' +
    '</div>' +
    '<div class="grid g2" style="margin-bottom:16px">' +
    card("项目进度", "按完成度", '<div style="padding:4px 18px 16px">' + prog + '</div>', '<button class="btn sm" data-top2="projects">全部项目 →</button>') +
    card("即将到来的里程碑", "别忘了这些节点", '<div style="padding:0 18px 12px">' + milestones + '</div>', "") +
    '</div>' +
    card("最近更新", "你最近动过的任务", '<div style="padding:0 18px 12px">' + recent + '</div>', "");

  var m = qs("#motto");
  if (m) m.addEventListener("blur", async function () {
    var v = (m.textContent || "").trim();
    state.settings.home_motto = v;
    try { await put("/api/settings", { home_motto: v }); toast("已经记下这句话", "success"); } catch (e) { }
  });
  var g2 = qs("[data-top2=projects]");
  if (g2) g2.addEventListener("click", function () { state.view = "projects"; renderShell(); router(); });
  qsa("[data-plus]").forEach(function (b) {
    b.addEventListener("click", async function () {
      var t = taskByIdAcross(Number(b.dataset.plus));
      if (!t) return;
      var np2 = clamp((Number(t.progress) || 0) + 10, 0, 100);
      try { await put("/api/tasks/" + t.id, { progress: np2 }); await reloadAll(); router(); } catch (e) { toast(e.message, "error"); }
    });
  });
  qsa("[data-done]").forEach(function (b) {
    b.addEventListener("click", async function () {
      var t = taskByIdAcross(Number(b.dataset.done));
      if (!t) return;
      try { await put("/api/tasks/" + t.id, { progress: 100, status: "done" }); toast("完成啦 🎉", "success"); await reloadAll(); router(); }
      catch (e) { toast(e.message, "error"); }
    });
  });
}

function taskByIdAcross(id) {
  var found = null;
  (state.stats && state.stats.focus || []).forEach(function (t) { if (t.id === id) found = t; });
  return found;
}
function kpi(icon, color, num, label) {
  return '<div class="kpi" style="--c:' + color + '"><div class="ic">' + icon + '</div><div><b>' + num + '</b><span>' + label + '</span></div></div>';
}
function card(title, sub, body, right) {
  return '<div class="card"><div class="card-head"><h3>' + esc(title) + '</h3><span class="sub">' + esc(sub) + '</span>' +
    (right ? '<div class="right">' + right + '</div>' : "") + '</div>' + body + '</div>';
}

/* ============================================================
   项目
   ============================================================ */
function renderProjects() {
  renderTop("项目", "共 " + state.projects.length + " 个项目",
    '<input class="input" data-top="q" placeholder="搜索项目…" style="width:180px;height:38px" value="' + attr(state.pq || "") + '">' +
    '<button class="btn primary sm" data-top="new">＋ 新建项目</button>');
  var q = qs("[data-top=q]");
  q.addEventListener("input", debounce(function () { state.pq = q.value; renderProjects(); }, 220));
  qs("[data-top=new]").addEventListener("click", function () { projectModal(null); });

  var kw = (state.pq || "").toLowerCase();
  var list = state.projects.filter(function (p) {
    if (!kw) return true;
    return (p.name + " " + (p.description || "") + " " + (p.tags || "")).toLowerCase().indexOf(kw) >= 0;
  });

  var cards = list.map(function (p) {
    return '<div class="pcard" data-go="' + p.id + '" style="--c:' + p.color + '">' +
      '<div class="pcover"><span class="emo">' + esc(p.emoji) + '</span>' +
      '<span class="menu">' +
      '<button data-exp="' + p.id + '" title="导出备份">⬇</button>' +
      '<button data-edit="' + p.id + '" title="编辑">✎</button>' +
      '<button data-del="' + p.id + '" title="删除">✕</button>' +
      '</span></div>' +
      '<div class="pbody">' +
      '<div style="display:flex;align-items:flex-start;gap:9px"><h3 style="flex:1">' + esc(p.name) + '</h3>' + pstatusChip(p.status) + '</div>' +
      '<div class="pdesc">' + esc(p.description || "还没有写描述") + '</div>' +
      '<div style="display:flex;align-items:center;gap:13px">' + ring(p.progress, p.color, 52, 6) +
      '<div class="pstats" style="flex:1">' +
      '<span>任务 <b>' + p.task_count + '</b></span>' +
      '<span>完成 <b>' + p.done_count + '</b></span>' +
      '<span>附件 <b>' + p.attachment_count + '</b></span>' +
      '<span>连线 <b>' + p.link_count + '</b></span>' +
      (p.overdue_count ? '<span class="chip red">逾期 ' + p.overdue_count + '</span>' : "") +
      '</div></div>' +
      '<div class="small muted">' + esc(p.start_date) + ' → ' + esc(p.end_date) + (p.tags ? ' · ' + esc(p.tags) : "") + '</div>' +
      '</div>' +
      '<div class="pfoot"><span class="chip gray">' + (PRIORITY[p.priority] ? PRIORITY[p.priority].t : "") + '优先级</span>' +
      (p.milestone_count ? '<span class="chip gray">🚩 ' + p.milestone_count + '</span>' : "") +
      '<span class="spacer"></span><button class="btn sm soft" data-gantt="' + p.id + '">甘特图 →</button></div>' +
      '</div>';
  }).join("");

  qs("#content").innerHTML = cards
    ? '<div class="pgrid">' + cards + '</div>'
    : emptyState("📁", "还没有项目", "创建第一个项目，把想法装进去", '<button class="btn primary" data-top="new2" style="margin-top:8px">＋ 新建项目</button>');
  var n2 = qs("[data-top=new2]"); if (n2) n2.addEventListener("click", function () { projectModal(null); });

  qsa("[data-go]").forEach(function (el) {
    el.addEventListener("click", async function (e) {
      if (e.target.closest("[data-exp],[data-edit],[data-del],[data-gantt]")) return;
      await openProject(Number(el.dataset.go));
      state.view = "gantt"; renderShell(); router();
    });
  });
  qsa("[data-gantt]").forEach(function (b) {
    b.addEventListener("click", async function (e) {
      e.stopPropagation();
      await openProject(Number(b.dataset.gantt));
      state.view = "gantt"; renderShell(); router();
    });
  });
  qsa("[data-edit]").forEach(function (b) {
    b.addEventListener("click", function (e) { e.stopPropagation(); projectModal(projectById(Number(b.dataset.edit))); });
  });
  qsa("[data-exp]").forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      download("/api/projects/" + b.dataset.exp + "/export");
      toast("正在导出项目备份（含附件）…", "success");
    });
  });
  qsa("[data-del]").forEach(function (b) {
    b.addEventListener("click", async function (e) {
      e.stopPropagation();
      var p = projectById(Number(b.dataset.del));
      var ok = await confirmDialog({ title: "删除项目", message: "确定删除「" + p.name + "」吗？项目下的任务、连线和附件都会被一起删除，无法恢复。", okText: "删除", danger: true });
      if (!ok) return;
      try {
        await del("/api/projects/" + p.id);
        toast("已删除", "success");
        if (state.project && state.project.id === p.id) state.project = null;
        await reloadAll(); router();
      } catch (err) { toast(err.message, "error"); }
    });
  });
}

/* ---------------- 项目表单 ---------------- */
function projectModal(p) {
  var isNew = !p;
  p = p || {
    name: "", description: "", emoji: "🚀", color: COLORS[0], status: "active", priority: "medium",
    start_date: todayStr(), end_date: fmtDate(addDays(today(), 30)), tags: ""
  };
  var sw = COLORS.map(function (c) {
    return '<button type="button" class="sw' + (c === p.color ? " on" : "") + '" data-color="' + c + '" style="background:' + c + '"></button>';
  }).join("");
  var emo = EMOJIS.map(function (e2) {
    return '<button type="button" class="' + (e2 === p.emoji ? "on" : "") + '" data-emoji="' + e2 + '">' + e2 + '</button>';
  }).join("");

  var mask = openModal(
    '<div class="modal"><div class="mhead"><h3>' + (isNew ? "新建项目" : "编辑项目") + '</h3><button class="x" data-close>✕</button></div>' +
    '<div class="mbody"><div class="fgrid">' +
    '<label class="field full"><span>项目名称</span><input class="input" id="p-name" value="' + attr(p.name) + '" placeholder="比如：记账助手 App"></label>' +
    '<div class="field full"><span>选个图标</span><div class="emojis" id="p-emoji">' + emo + '</div></div>' +
    '<label class="field"><span>状态</span><select class="select" id="p-status">' +
    Object.keys(PSTATUS).map(function (k) { return '<option value="' + k + '"' + (p.status === k ? " selected" : "") + '>' + PSTATUS[k].t + '</option>'; }).join("") + '</select></label>' +
    '<label class="field"><span>优先级</span><select class="select" id="p-priority">' +
    Object.keys(PRIORITY).map(function (k) { return '<option value="' + k + '"' + (p.priority === k ? " selected" : "") + '>' + PRIORITY[k].t + '</option>'; }).join("") + '</select></label>' +
    '<label class="field"><span>开始日期</span><input class="input" type="date" id="p-start" value="' + p.start_date + '"></label>' +
    '<label class="field"><span>预计结束</span><input class="input" type="date" id="p-end" value="' + p.end_date + '"></label>' +
    '<label class="field full"><span>标签（逗号分隔）</span><input class="input" id="p-tags" value="' + attr(p.tags || "") + '" placeholder="自研, 学习, 生活"></label>' +
    '<label class="field full"><span>项目描述</span><textarea class="textarea" id="p-desc" placeholder="想做一件什么事？">' + esc(p.description || "") + '</textarea></label>' +
    '<div class="field full"><span>主题色</span><div class="swatches" id="p-sw">' + sw + '</div></div>' +
    '</div></div>' +
    '<div class="mfoot">' + (isNew ? "" : '<button class="btn danger" data-del>删除项目</button><button class="btn" data-export>⬇ 导出备份</button>') +
    '<span class="spacer"></span><button class="btn" data-close>取消</button><button class="btn primary" data-save>保存</button></div></div>'
  );

  qs("#p-emoji", mask).addEventListener("click", function (e) {
    var b = e.target.closest("[data-emoji]"); if (!b) return;
    qsa("#p-emoji button", mask).forEach(function (x) { x.classList.remove("on"); });
    b.classList.add("on");
  });
  qs("#p-sw", mask).addEventListener("click", function (e) {
    var b = e.target.closest(".sw"); if (!b) return;
    qsa("#p-sw .sw", mask).forEach(function (x) { x.classList.remove("on"); });
    b.classList.add("on");
  });
  var delB = qs("[data-del]", mask);
  if (delB) delB.addEventListener("click", async function () {
    mask.__close();
    var ok = await confirmDialog({ title: "删除项目", message: "确定删除「" + p.name + "」？附件也会一起删除。", okText: "删除", danger: true });
    if (!ok) return;
    try { await del("/api/projects/" + p.id); toast("已删除", "success"); if (state.project && state.project.id === p.id) state.project = null; await reloadAll(); router(); }
    catch (e) { toast(e.message, "error"); }
  });
  var expB = qs("[data-export]", mask);
  if (expB) expB.addEventListener("click", function () { download("/api/projects/" + p.id + "/export"); toast("正在导出（含附件）…", "success"); });

  qs("[data-save]", mask).addEventListener("click", async function () {
    var name = qs("#p-name", mask).value.trim();
    if (!name) { toast("给项目起个名字吧", "warn"); return; }
    var body = {
      name: name,
      description: qs("#p-desc", mask).value,
      emoji: (qs("#p-emoji button.on", mask) || { textContent: "📁" }).textContent,
      color: (qs("#p-sw .sw.on", mask) || { dataset: { color: p.color } }).dataset.color,
      status: qs("#p-status", mask).value,
      priority: qs("#p-priority", mask).value,
      start_date: qs("#p-start", mask).value || todayStr(),
      end_date: qs("#p-end", mask).value || todayStr(),
      tags: qs("#p-tags", mask).value.trim()
    };
    try {
      if (isNew) { var r = await post("/api/projects", body); state.project = r.project; }
      else { await put("/api/projects/" + p.id, body); }
      mask.__close();
      toast(isNew ? "项目建好啦 🎉" : "已保存", "success");
      await reloadAll();
      if (isNew) { await openProject(state.project.id); state.view = "gantt"; renderShell(); }
      router();
    } catch (e) { toast(e.message, "error"); }
  });
}

import { request } from "./api.js";

/* ============================================================
   甘特图视图
   ============================================================ */
async function renderGanttView() {
  if (!state.projects.length) {
    renderTop("甘特图", "还没有项目", '<button class="btn primary sm" data-top="np">＋ 新建项目</button>');
    qs("[data-top=np]").addEventListener("click", function () { projectModal(null); });
    qs("#content").innerHTML = emptyState("📅", "先创建一个项目", "有了项目就能在甘特图里排期和连线了");
    return;
  }
  if (ensureProject()) await openProject(state.project.id);
  var p = state.project;
  renderTop("甘特图 · " + p.emoji + " " + p.name,
    state.tasks.length + " 个任务 · " + state.links.length + " 条连线 · " + state.attachments.length + " 个附件",
    projectSelect() +
    '<button class="btn primary sm" data-top="nt">＋ 新建任务</button>' +
    '<button class="btn sm" data-top="exp">⬇ 导出项目</button>');
  bindProjectSelect();
  qs("[data-top=nt]").addEventListener("click", function () { taskModal(null, null); });
  qs("[data-top=exp]").addEventListener("click", function () { download("/api/projects/" + p.id + "/export"); toast("正在导出（含附件）…", "success"); });

  qs("#content").innerHTML = '<div id="ganttHost" style="height:calc(100vh - 168px);min-height:460px"></div>';
  ganttComp = createGantt(qs("#ganttHost"), {
    tasks: state.tasks,
    links: state.links,
    attachments: state.attachments,
    colorOf: colorOf,
    zoom: state.zoom,
    collapsed: state.collapsed || {},
    selected: state.selectedTask,
    linkMode: state.linkMode,
    pendingLink: state.pendingLink,
    onSelect: function (id) { state.selectedTask = id; },
    onZoom: function (z) { state.zoom = z; try { localStorage.setItem("wb-zoom", z); } catch (e) { } },
    onCollapseChange: function (c) { state.collapsed = c; },
    onEdit: function (id, focusAtt) { taskModal(taskById(id), null, focusAtt); },
    onAddChild: function (id) { taskModal(null, id); },
    onDelete: function (id) { var t = taskById(id); if (t) deleteTask(t); },
    onInlineEdit: async function (id, field, value) {
      var body = {};
      var t = taskById(id);
      if (t && t.type === "milestone" && (field === "start_date" || field === "end_date")) {
        body.start_date = value;
        body.end_date = value;
      } else {
        body[field] = value;
        if (t && field === "start_date" && value > t.end_date) {
          var dur = Math.max(0, diffDays(parseDate(t.start_date), parseDate(t.end_date)));
          body.end_date = fmtDate(addDays(parseDate(value), dur));
        }
        if (t && field === "end_date" && value < t.start_date) body.start_date = value;
      }
      if (field === "progress" && value >= 100) body.status = "done";
      try {
        await put("/api/tasks/" + id, body);
        toast("已更新", "success", 1200);
        await refreshProject(); await reloadAll();
      } catch (e) { toast(e.message, "error"); await refreshProject(); }
    },
    onDatesChange: async function (id, sd, ed) {
      try {
        var dt = taskById(id);
        var dkids = dt ? childrenOfId(id) : [];
        if (dt && dt.type === "group" && dkids.length) {
          var span = spanOfTask(dt);
          var delta = diffDays(span[0], parseDate(sd));
          if (!isFinite(delta)) delta = 0;
          if (delta !== 0) {
            var list = [id].concat(descendantIds(id));
            for (var i = 0; i < list.length; i++) {
              var x = taskById(list[i]);
              if (!x) continue;
              await put("/api/tasks/" + x.id, {
                start_date: fmtDate(addDays(parseDate(x.start_date), delta)),
                end_date: fmtDate(addDays(parseDate(x.end_date), delta))
              });
            }
          }
        } else {
          await put("/api/tasks/" + id, { start_date: sd, end_date: ed });
        }
        toast("排期更新 " + sd + " → " + ed, "success");
        await refreshProject(); await reloadAll();
      } catch (e) { toast(e.message, "error"); }
    },
    onToggleLink: function () {
      state.linkMode = !state.linkMode;
      state.pendingLink = null;
      ganttComp.setLinkState(state.linkMode, null);
      toast(state.linkMode ? "连线模式已开启：先点起点，再点终点" : "已退出连线模式", "success");
    },
    onLinkPick: async function (id) {
      if (state.pendingLink == null) {
        state.pendingLink = id;
        ganttComp.setLinkState(true, id);
        return;
      }
      if (state.pendingLink === id) {
        state.pendingLink = null;
        ganttComp.setLinkState(true, null);
        return;
      }
      try {
        await post("/api/links", { project_id: state.project.id, source_id: state.pendingLink, target_id: id });
        toast("连线已添加 🔗", "success");
        state.pendingLink = null;
        await refreshProject(); await reloadAll();
        ganttComp.setLinkState(state.linkMode, null);
      } catch (e) { toast(e.message, "error"); state.pendingLink = null; ganttComp.setLinkState(true, null); }
    },
    onLinkDelete: async function (linkId) {
      var l = null;
      state.links.forEach(function (x) { if (x.id === linkId) l = x; });
      if (!l) return;
      var a = taskById(l.source_id), b = taskById(l.target_id);
      var ok = await confirmDialog({ title: "删除连线", message: "删除「" + (a ? a.name : "") + "」→「" + (b ? b.name : "") + "」这条依赖连线？", okText: "删除", danger: true });
      if (!ok) return;
      try { await del("/api/links/" + linkId); toast("连线已删除", "success"); await refreshProject(); await reloadAll(); }
      catch (e) { toast(e.message, "error"); }
    }
  });
}

/* ============================================================
   看板
   ============================================================ */
var COLS = [
  { k: "todo", t: "待办", c: "#938CAC" },
  { k: "doing", t: "进行中", c: "#F5A623" },
  { k: "paused", t: "搁置", c: "#3AB8DC" },
  { k: "done", t: "已完成", c: "#2FB88A" }
];
async function renderBoard() {
  if (!state.projects.length) { renderGanttView(); return; }
  if (ensureProject()) await openProject(state.project.id);
  var p = state.project;
  renderTop("看板 · " + p.emoji + " " + p.name, "拖动卡片就能改变任务状态",
    projectSelect() + '<button class="btn primary sm" data-top="nt">＋ 新建任务</button>');
  bindProjectSelect();
  qs("[data-top=nt]").addEventListener("click", function () { taskModal(null, null); });

  var items = state.tasks.filter(function (t) { return t.type !== "group"; });
  var cols = COLS.map(function (col) {
    var list = items.filter(function (t) { return (t.status || "todo") === col.k; });
    var cards = list.map(function (t) {
      var late = t.status !== "done" && parseDate(t.end_date) < today();
      var na = state.attachments.filter(function (x) { return x.task_id === t.id; }).length;
      var kc = colorOf(t);
      return '<div class="kcard" draggable="true" data-task="' + t.id + '" style="--c:' + kc + '">' +
        '<h4>' + esc(t.name) + '</h4>' +
        '<div class="kmeta">' +
        (t.type === "milestone" ? '<span class="chip">◆ 里程碑</span>' : "") +
        (t.status === "done" ? '<span class="mk done">✓ 完成</span>' : "") +
        '<span>📅 ' + esc(String(t.end_date).slice(5)) + '</span>' +
        (na ? '<span class="mk att">📎 ' + na + '</span>' : "") +
        (late ? '<span class="chip red">逾期</span>' : "") +
        '</div>' +
        '<div class="progress sm" style="margin-top:9px"><i style="width:' + (t.progress || 0) + '%;background:' + kc + '"></i></div>' +
        '</div>';
    }).join("");
    return '<div class="kcol" data-col="' + col.k + '" style="--c:' + col.c + '">' +
      '<div class="khead"><i class="dot"></i>' + col.t + '<span class="n">' + list.length + '</span></div>' +
      (cards || '<div class="muted small" style="padding:16px 6px;text-align:center">空空的</div>') + '</div>';
  }).join("");
  qs("#content").innerHTML = '<div class="kanban">' + cols + '</div>';

  qsa(".kcard").forEach(function (c) {
    c.addEventListener("dragstart", function (e) { e.dataTransfer.setData("text/plain", c.dataset.task); c.classList.add("drag"); });
    c.addEventListener("dragend", function () { c.classList.remove("drag"); });
    c.addEventListener("dblclick", function () { taskModal(taskById(Number(c.dataset.task)), null); });
  });
  qsa(".kcol").forEach(function (col) {
    col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("over"); });
    col.addEventListener("dragleave", function () { col.classList.remove("over"); });
    col.addEventListener("drop", async function (e) {
      e.preventDefault(); col.classList.remove("over");
      var id = Number(e.dataTransfer.getData("text/plain"));
      var t = taskById(id);
      if (!t || t.status === col.dataset.col) return;
      var old = t.status, oldP = t.progress;
      t.status = col.dataset.col;
      if (t.status === "done") t.progress = 100;
      try {
        await put("/api/tasks/" + id, { status: t.status, progress: t.progress });
        toast("移到「" + (STATUS[t.status] ? STATUS[t.status].t : t.status) + "」啦", "success");
        await refreshProject(); await reloadAll();
        renderBoard();
      } catch (err) { t.status = old; t.progress = oldP; toast(err.message, "error"); renderBoard(); }
    });
  });
}

/* ============================================================
   资料库
   ============================================================ */
async function renderFiles() {
  var d = await get("/api/attachments");
  var all = d.attachments || [];
  renderTop("资料库", "共 " + all.length + " 个附件 · " + bytes(all.reduce(function (a, b) { return a + b.size; }, 0)),
    '<select class="select" data-top="pf" style="width:auto"><option value="all">全部项目</option>' +
    state.projects.map(function (p) { return '<option value="' + p.id + '">' + esc(p.emoji + " " + p.name) + '</option>'; }).join("") +
    '</select><input class="input" data-top="q" placeholder="搜索文件名…" style="width:180px;height:38px" value="' + attr(state.fq || "") + '">');

  function paint() {
    var pid = qs("[data-top=pf]").value;
    var kw = (state.fq || "").toLowerCase();
    var list = all.filter(function (a) {
      if (pid !== "all" && String(a.project_id) !== pid) return false;
      if (kw && a.name.toLowerCase().indexOf(kw) < 0) return false;
      return true;
    });
    qs("#content").innerHTML = list.length ? '<div class="files">' + list.map(function (a) {
      var ic = fileIcon(a.name, a.mime);
      var isImg = String(a.mime || "").indexOf("image/") === 0;
      return '<div class="fcard" style="--c:' + ic.c + '">' +
        '<div class="fthumb">' +
        (isImg ? '<img src="/api/attachments/' + a.id + '/download?inline=1" alt="" loading="lazy">' : ic.e) +
        '<span class="ext" style="--c:' + ic.c + '">' + extLabel(a.name) + '</span>' +
        '</div>' +
        '<div class="finfo"><b title="' + attr(a.name) + '">' + esc(a.name) + '</b>' +
        '<span>' + esc((a.project_emoji || "📁") + " " + (a.project_name || "")) + '</span>' +
        '<span>' + (a.task_name ? "任务： " + esc(a.task_name) + " · " : "") + bytes(a.size) + ' · ' + esc(String(a.created_at).slice(0, 10)) + '</span>' +
        '</div>' +
        '<div class="ffoot"><button class="btn sm" data-dl="' + a.id + '">下载</button>' +
        '<button class="btn sm ghost" data-open="' + a.id + '">打开</button>' +
        '<span class="spacer"></span><button class="btn sm danger" data-rm="' + a.id + '">✕</button></div>' +
        '</div>';
    }).join("") + '</div>' : emptyState("📎", "还没有附件", "在任务里点 📎 就能上传文件");

    qsa("[data-dl]").forEach(function (b) { b.addEventListener("click", function () { download("/api/attachments/" + b.dataset.dl + "/download"); }); });
    qsa("[data-open]").forEach(function (b) { b.addEventListener("click", function () { window.open("/api/attachments/" + b.dataset.open + "/download?inline=1", "_blank"); }); });
    qsa("[data-rm]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var a = null; all.forEach(function (x) { if (String(x.id) === b.dataset.rm) a = x; });
        var ok = await confirmDialog({ title: "删除附件", message: "确定删除「" + (a ? a.name : "") + "」？文件会被永久删除。", okText: "删除", danger: true });
        if (!ok) return;
        try { await del("/api/attachments/" + b.dataset.rm); toast("已删除", "success"); renderFiles(); } catch (e) { toast(e.message, "error"); }
      });
    });
  }
  qs("[data-top=pf]").addEventListener("change", paint);
  var qi = qs("[data-top=q]");
  qi.addEventListener("input", debounce(function () { state.fq = qi.value; paint(); }, 220));
  paint();
}

/* ============================================================
   设置
   ============================================================ */
function renderSettings() {
  var s = state.settings;
  renderTop("设置", "让它更像你自己的工具");
  var sw = COLORS.map(function (c) {
    return '<button class="sw' + ((s.accent || "").toLowerCase() === c.toLowerCase() ? " on" : "") + '" data-accent="' + c + '" style="background:' + c + '"></button>';
  }).join("");
  var emo = EMOJIS.map(function (e2) {
    return '<button class="' + (e2 === s.avatar ? "on" : "") + '" data-avatar="' + e2 + '">' + e2 + '</button>';
  }).join("");

  qs("#content").innerHTML =
    '<div class="grid g2" style="margin-bottom:16px">' +
    '<div class="card"><div class="card-head"><h3>个人资料</h3><span class="sub">叫什么好呢</span></div>' +
    '<div class="card-body" style="display:flex;flex-direction:column;gap:15px">' +
    '<label class="field"><span>昵称</span><input class="input" id="s-nick" value="' + attr(s.nickname || "") + '"></label>' +
    '<label class="field"><span>头像</span><div class="emojis" id="s-ava">' + emo + '</div></label>' +
    '<label class="field"><span>首页标语</span><input class="input" id="s-motto" value="' + attr(s.home_motto || "") + '"></label>' +
    '<label class="field"><span>工作台名称</span><input class="input" id="s-app" value="' + attr(s.app_name || "") + '"></label>' +
    '<div><button class="btn primary" data-save-profile>保存资料</button></div>' +
    '</div></div>' +
    '<div class="card"><div class="card-head"><h3>外观</h3><span class="sub">选一个喜欢的颜色</span></div>' +
    '<div class="card-body" style="display:flex;flex-direction:column;gap:15px">' +
    '<div class="field"><span>主题色</span><div class="swatches" id="s-accent">' + sw + '</div></div>' +
    '<div class="field"><span>明暗主题</span><div class="row"><button class="btn" data-settheme="light">☀️ 浅色</button><button class="btn" data-settheme="dark">🌙 深色</button></div></div>' +
    '<div class="field"><span>甘特图默认缩放</span><select class="select" id="s-zoom">' +
    ["day", "week", "month"].map(function (z) { return '<option value="' + z + '"' + (s.default_zoom === z ? " selected" : "") + '>' + ({ day: "日", week: "周", month: "月" }[z]) + '</option>'; }).join("") +
    '</select></div>' +
    '<div class="small muted">主题色会应用到按钮、图表、甘特图等你看到的大部分地方。</div>' +
    '</div></div>' +
    '</div>' +
    '<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>数据管理</h3><span class="sub">备份、恢复与导出</span></div>' +
    '<div class="card-body"><div class="setlist">' +
    '<div class="setitem"><div class="si">📦</div><div class="st"><b>导出全部备份</b><span>把所有项目、任务、连线和附件打包成一个 ZIP</span></div>' +
    '<button class="btn primary" data-all-backup>导出全部</button></div>' +
    '<div class="setitem"><div class="si">⬆️</div><div class="st"><b>导入项目备份</b><span>选择一个 .zip 项目备份文件恢复为新项目</span></div>' +
    '<button class="btn" data-import-project>选择文件</button></div>' +
    '<div class="setitem"><div class="si">♻️</div><div class="st"><b>恢复全部备份</b><span>用整体备份覆盖当前全部数据（谨慎操作）</span></div>' +
    '<button class="btn danger" data-import-all>恢复备份</button></div>' +
    '<div class="setitem"><div class="si">📄</div><div class="st"><b>导出任务清单 CSV</b><span>Excel / 数字表格可直接打开</span></div>' +
    '<button class="btn" data-csv>导出 CSV</button></div>' +
    '</div>' +
    '<div class="small muted" style="margin-top:14px">单个项目也可以在「项目」页面卡片右上角 ⬇ 直接导出。</div>' +
    '</div></div>' +
    '<div class="card" style="margin-bottom:16px"><div class="card-head"><h3>项目备份</h3><span class="sub">逐个导出，含全部附件</span></div>' +
    '<div class="card-body"><div class="setlist">' +
    (state.projects.length ? state.projects.map(function (p) {
      return '<div class="setitem"><div class="si" style="background:color-mix(in srgb, ' + p.color + ' 16%, transparent)">' + esc(p.emoji) + '</div>' +
        '<div class="st"><b>' + esc(p.name) + '</b><span>' + p.task_count + ' 个任务 · ' + p.attachment_count + ' 个附件 · ' + p.link_count + ' 条连线</span></div>' +
        '<button class="btn sm" data-pb="' + p.id + '">⬇ 导出</button></div>';
    }).join("") : '<div class="muted small">还没有项目</div>') +
    '</div></div></div>' +
    '<div class="card"><div class="card-head"><h3>关于</h3></div><div class="card-body" id="aboutBox"><span class="muted small">加载中…</span></div></div>';

  qs("[data-save-profile]").addEventListener("click", async function () {
    try {
      await put("/api/settings", {
        nickname: qs("#s-nick").value.trim() || "我的",
        avatar: (qs("#s-ava button.on") || { textContent: "🌱" }).textContent,
        home_motto: qs("#s-motto").value,
        app_name: qs("#s-app").value.trim() || "我的工作台"
      });
      await reloadAll(); renderShell(); renderSettings(); toast("保存好啦", "success");
    } catch (e) { toast(e.message, "error"); }
  });
  qs("#s-ava").addEventListener("click", function (e) {
    var b = e.target.closest("[data-avatar]"); if (!b) return;
    qsa("#s-ava button").forEach(function (x) { x.classList.remove("on"); });
    b.classList.add("on");
  });
  qs("#s-accent").addEventListener("click", async function (e) {
    var b = e.target.closest("[data-accent]"); if (!b) return;
    qsa("#s-accent .sw").forEach(function (x) { x.classList.remove("on"); });
    b.classList.add("on");
    var c = b.dataset.accent;
    applyAccent(c);
    try { await put("/api/settings", { accent: c }); state.settings.accent = c; toast("换个心情 🎨", "success"); } catch (err) { }
  });
  qsa("[data-settheme]").forEach(function (b) {
    b.addEventListener("click", function () { applyTheme(b.dataset.settheme); renderSettings(); });
  });
  qs("#s-zoom").addEventListener("change", async function (e) {
    try { await put("/api/settings", { default_zoom: e.target.value }); state.settings.default_zoom = e.target.value; toast("已保存", "success"); } catch (err) { }
  });

  var fAll = document.createElement("input"); fAll.type = "file"; fAll.accept = ".zip";
  var fProj = document.createElement("input"); fProj.type = "file"; fProj.accept = ".zip";
  qs("[data-all-backup]").addEventListener("click", function () { download("/api/backup/export"); toast("正在打包全部数据…", "success"); });
  qs("[data-csv]").addEventListener("click", function () { download("/api/export/tasks.csv"); toast("正在导出…", "success"); });
  qs("[data-import-project]").addEventListener("click", function () { fProj.click(); });
  qs("[data-import-all]").addEventListener("click", function () { fAll.click(); });
  fProj.addEventListener("change", async function () {
    var f = fProj.files[0]; if (!f) return;
    try {
      var r = await request("POST", "/api/projects/import", f, true);
      toast("导入成功：" + r.project.name, "success");
      await reloadAll(); state.view = "projects"; renderShell(); router();
    } catch (e) { toast(e.message, "error"); }
    fProj.value = "";
  });
  fAll.addEventListener("change", async function () {
    var f = fAll.files[0]; if (!f) return;
    var ok = await confirmDialog({ title: "恢复全部备份", message: "这会用备份完全覆盖当前所有项目、任务和附件，无法撤销。确定继续吗？", okText: "确认恢复", danger: true });
    if (!ok) { fAll.value = ""; return; }
    try {
      var r = await request("POST", "/api/backup/import", f, true);
      toast("恢复完成，正在重新加载…", "success");
      setTimeout(function () { location.reload(); }, 900);
    } catch (e) { toast(e.message, "error"); fAll.value = ""; }
  });
  qsa("[data-pb]").forEach(function (b) {
    b.addEventListener("click", function () { download("/api/projects/" + b.dataset.pb + "/export"); toast("正在导出…", "success"); });
  });

  get("/api/system/info").then(function (info) {
    var box = qs("#aboutBox");
    if (!box) return;
    box.innerHTML = '<div class="row wrap" style="gap:8px;margin-bottom:12px">' +
      '<span class="chip">Node ' + esc(info.node) + '</span>' +
      '<span class="chip gray">' + esc(info.platform + " / " + info.arch) + '</span>' +
      '<span class="chip gray">数据库 ' + bytes(info.db_size) + '</span>' +
      '<span class="chip gray">附件 ' + bytes(info.files_size) + '</span></div>' +
      '<div class="small muted">数据目录：' + esc(info.db_file) + '<br>附件目录：' + esc(info.files_dir) + '<br>' +
      '本工作台完全运行在你自己电脑上，不需要联网，也不需要登录。</div>';
  }).catch(function () { });
}

/* ============================================================
   任务编辑（含附件）
   ============================================================ */
function attachmentRows(atts, taskId) {
  if (!atts.length) return '<div class="muted small" style="padding:6px 2px">还没有附件，拖个文件进来吧</div>';
  return atts.map(function (a) {
    var ic = fileIcon(a.name, a.mime);
    return '<div class="att" style="--c:' + ic.c + '"><span class="ic">' + ic.e + '</span>' +
      '<span class="nm"><b>' + esc(a.name) + '</b><span>' + bytes(a.size) + ' · ' + esc(String(a.created_at).slice(0, 16)) + '</span></span>' +
      '<button class="btn sm ghost" data-adl="' + a.id + '">下载</button>' +
      '<button class="btn sm ghost" data-arm="' + a.id + '">✕</button></div>';
  }).join("");
}

function taskModal(t, parentId, focusAtt) {
  var isNew = !t;
  var proj = state.project || {};
  t = t || {
    id: null, project_id: proj.id, parent_id: parentId || null, name: "", type: "task",
    start_date: todayStr(), end_date: fmtDate(addDays(today(), 4)), progress: 0, status: "todo",
    priority: "medium", color: proj.color || COLORS[0], color_mode: "auto", notes: ""
  };
  var banned = {};
  if (t.id) {
    banned[t.id] = true;
    var stack = [t.id];
    while (stack.length) {
      var cur = stack.pop();
      state.tasks.forEach(function (x) { if (x.parent_id === cur) { banned[x.id] = true; stack.push(x.id); } });
    }
  }
  var parentOpts = '<option value="">— 无（顶层）—</option>' + state.tasks.filter(function (x) {
    return x.type !== "milestone" && !banned[x.id];
  }).map(function (x) {
    return '<option value="' + x.id + '"' + (t.parent_id === x.id ? " selected" : "") + '>' + esc(x.name) + '</option>';
  }).join("");
  var autoC = colorOf(t);
  var isAuto = t.color_mode !== "manual";
  var sw = '<button type="button" class="sw auto' + (isAuto ? " on" : "") + '" data-auto="1" title="自动配色" style="background:' + autoC + '">✨</button>' +
    COLORS.map(function (c) {
      return '<button type="button" class="sw' + (!isAuto && c === t.color ? " on" : "") + '" data-color="' + c + '" style="background:' + c + '"></button>';
    }).join("");
  var myAtts = isNew ? [] : state.attachments.filter(function (a) { return a.task_id === t.id; });

  var mask = openModal(
    '<div class="modal wide"><div class="mhead"><h3>' + (isNew ? "新建任务" : "编辑任务") + '</h3><button class="x" data-close>✕</button></div>' +
    '<div class="mbody">' +
    '<label class="field"><span>任务名称</span><input class="input" id="t-name" value="' + attr(t.name) + '" placeholder="要做的这件事是？"></label>' +
    '<div class="fgrid">' +
    '<label class="field"><span>类型</span><select class="select" id="t-type">' +
    Object.keys(TYPES).map(function (k) { return '<option value="' + k + '"' + (t.type === k ? " selected" : "") + '>' + TYPES[k].t + '</option>'; }).join("") + '</select></label>' +
    '<label class="field"><span>状态</span><select class="select" id="t-status">' +
    Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (t.status === k ? " selected" : "") + '>' + STATUS[k].t + '</option>'; }).join("") + '</select></label>' +
    '<label class="field"><span>开始日期</span><input class="input" type="date" id="t-start" value="' + t.start_date + '"></label>' +
    '<label class="field"><span>结束日期</span><input class="input" type="date" id="t-end" value="' + t.end_date + '"></label>' +
    '<label class="field"><span>上级阶段</span><select class="select" id="t-parent">' + parentOpts + '</select></label>' +
    '<label class="field"><span>优先级</span><select class="select" id="t-priority">' +
    Object.keys(PRIORITY).map(function (k) { return '<option value="' + k + '"' + (t.priority === k ? " selected" : "") + '>' + PRIORITY[k].t + '</option>'; }).join("") + '</select></label>' +
    '<div class="field full"><span>完成进度 <b id="t-pv">' + (t.progress || 0) + '%</b></span>' +
    '<div class="range-row"><input type="range" id="t-progress" min="0" max="100" step="5" value="' + (t.progress || 0) + '"></div></div>' +
    '<div class="field full"><span>颜色 · 默认自动配色 ✨</span><div class="swatches" id="t-sw">' + sw + '</div></div>' +
    '<label class="field full"><span>备注</span><textarea class="textarea" id="t-notes" placeholder="随手记点什么">' + esc(t.notes || "") + '</textarea></label>' +
    '<div class="field full"><span>附件</span>' +
    (isNew
      ? '<div class="muted small" style="padding:8px 2px">先保存任务，然后就能添加附件啦</div>'
      : '<div class="atts" id="t-atts">' + attachmentRows(myAtts, t.id) + '</div>' +
      '<div class="drop" id="t-drop" style="margin-top:9px">📎 点击选择文件，或把文件拖到这里</div>' +
      '<input type="file" id="t-file" multiple hidden>') +
    '</div>' +
    '</div></div>' +
    '<div class="mfoot">' + (isNew ? "" : '<button class="btn danger" data-del>删除任务</button>') +
    '<span class="spacer"></span><button class="btn" data-close>取消</button><button class="btn primary" data-save>保存</button></div></div>'
  );

  qs("#t-sw", mask).addEventListener("click", function (e) {
    var b = e.target.closest(".sw"); if (!b) return;
    qsa("#t-sw .sw", mask).forEach(function (x) { x.classList.remove("on"); });
    b.classList.add("on");
  });
  var pr = qs("#t-progress", mask);
  pr.addEventListener("input", function () { qs("#t-pv", mask).textContent = pr.value + "%"; });
  var ty = qs("#t-type", mask);
  ty.addEventListener("change", function () { if (ty.value === "milestone") qs("#t-end", mask).value = qs("#t-start", mask).value; });
  var stt = qs("#t-status", mask);
  stt.addEventListener("change", function () {
    if (stt.value === "done") { pr.value = 100; qs("#t-pv", mask).textContent = "100%"; }
  });
  var delB = qs("[data-del]", mask);
  if (delB) delB.addEventListener("click", function () { mask.__close(); deleteTask(t); });

  /* 附件交互 */
  if (!isNew) {
    var attBox = qs("#t-atts", mask);
    var drop = qs("#t-drop", mask);
    var fileInput = qs("#t-file", mask);
    var queue = [];

    function wireAttButtons() {
      qsa("[data-adl]", attBox).forEach(function (b) {
        b.addEventListener("click", function () { download("/api/attachments/" + b.dataset.adl + "/download"); });
      });
      qsa("[data-arm]", attBox).forEach(function (b) {
        b.addEventListener("click", async function () {
          var ok = await confirmDialog({ title: "删除附件", message: "确定删除这个附件？", okText: "删除", danger: true });
          if (!ok) return;
          try {
            await del("/api/attachments/" + b.dataset.arm);
            toast("附件已删除", "success");
            await refreshProject();
            mask.__close(); await reloadAll(); taskModal(taskById(t.id), null, true);
            if (state.view === "files") renderFiles();
          } catch (e) { toast(e.message, "error"); }
        });
      });
    }
    async function uploadAll(files) {
      for (var i = 0; i < files.length; i++) {
        try { await uploadFile(t.id, files[i]); }
        catch (e) { toast("「" + files[i].name + "」上传失败：" + e.message, "error"); }
      }
      await refreshProject();
      var atts = state.attachments.filter(function (a) { return a.task_id === t.id; });
      attBox.innerHTML = attachmentRows(atts, t.id);
      wireAttButtons();
      toast("附件已上传 📎", "success");
    }
    wireAttButtons();
    drop.addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () { if (fileInput.files.length) uploadAll(Array.prototype.slice.call(fileInput.files)); fileInput.value = ""; });
    ["dragenter", "dragover"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); });
    });
    drop.addEventListener("drop", function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) uploadAll(Array.prototype.slice.call(files));
    });
    if (focusAtt) setTimeout(function () { drop.scrollIntoView({ block: "center", behavior: "smooth" }); }, 120);
  }

  qs("[data-save]", mask).addEventListener("click", async function () {
    var name = qs("#t-name", mask).value.trim();
    if (!name) { toast("给任务起个名字吧", "warn"); return; }
    var type = qs("#t-type", mask).value;
    var sd = qs("#t-start", mask).value || todayStr();
    var ed = qs("#t-end", mask).value || sd;
    if (type === "milestone") ed = sd;
    if (ed < sd) { var tmp = sd; sd = ed; ed = tmp; }
    var autoSw = qs("#t-sw .sw.auto", mask);
    var useAuto = autoSw && autoSw.classList.contains("on");
    var colorSw = qs("#t-sw .sw[data-color].on", mask);
    var chosen = useAuto ? colorOf(t) : (colorSw ? colorSw.dataset.color : colorOf(t));
    var body = {
      project_id: state.project.id,
      name: name, type: type, start_date: sd, end_date: ed,
      progress: Number(pr.value) || 0,
      status: qs("#t-status", mask).value,
      priority: qs("#t-priority", mask).value,
      parent_id: qs("#t-parent", mask).value ? Number(qs("#t-parent", mask).value) : null,
      color: chosen,
      color_mode: useAuto ? "auto" : "manual",
      notes: qs("#t-notes", mask).value
    };
    try {
      if (isNew) await post("/api/tasks", body);
      else await put("/api/tasks/" + t.id, body);
      mask.__close();
      toast(isNew ? "任务已创建 ✨" : "已保存", "success");
      await refreshProject(); await reloadAll();
      if (state.view === "board") renderBoard();
    } catch (e) { toast(e.message, "error"); }
  });
}

async function deleteTask(t) {
  if (!t) return;
  var ok = await confirmDialog({ title: "删除任务", message: "确定删除「" + t.name + "」以及它的子任务和附件吗？", okText: "删除", danger: true });
  if (!ok) return;
  try {
    await del("/api/tasks/" + t.id);
    toast("已删除", "success");
    await refreshProject(); await reloadAll();
    if (state.view === "board") renderBoard();
  } catch (e) { toast(e.message, "error"); }
}

/* ---------------- 启动 ---------------- */
try { state.zoom = localStorage.getItem("wb-zoom") || "day"; } catch (e) { state.zoom = "day"; }
boot();
