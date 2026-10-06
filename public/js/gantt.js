/* ============================================================
   甘特图：曲线依赖 / 手动连线 / 附件标记
   ============================================================ */
import { fmt, esc, attr, parseDate, fmtDate, addDays, diffDays, today } from "./util.js";

var ZOOM = { day: 32, week: 15, month: 7 };
var ROWH = 42;

export function createGantt(host, cfg) {
  cfg = cfg || {};
  var self = {
    zoom: cfg.zoom || "day",
    collapsed: cfg.collapsed || {},
    selected: cfg.selected || null
  };
  var view = { start: today(), end: today(), px: ZOOM.day };
  var pos = {};
  var dragging = null;

  host.innerHTML =
    '<div class="gantt">' +
    '<div class="gt-bar">' +
    '<div class="seg segbox" data-zoom><button data-z="day">日</button><button data-z="week">周</button><button data-z="month">月</button></div>' +
    '<button class="btn sm" data-act="link">🔗 连线</button>' +
    '<button class="btn sm" data-act="expand">展开</button>' +
    '<button class="btn sm" data-act="collapse">折叠</button>' +
    '<button class="btn sm" data-act="today">今天</button>' +
    '<span class="spacer"></span>' +
    '<span class="muted small" data-hint></span>' +
    '</div>' +
    '<div class="gt-body">' +
    '<div class="gt-left">' +
    '<div class="gt-lhead"><div>任务</div><div style="text-align:right">开始</div><div style="text-align:right">结束</div><div style="text-align:right">进度</div></div>' +
    '<div class="gt-lbody"></div>' +
    '</div>' +
    '<div class="gt-right">' +
    '<div class="gt-hwrap"><div class="gt-head"></div></div>' +
    '<div class="gt-scroll"><div class="gt-canvas"></div></div>' +
    '</div>' +
    '</div></div>';

  var root = host.querySelector(".gantt");
  var leftBody = host.querySelector(".gt-lbody");
  var headWrap = host.querySelector(".gt-hwrap");
  var headEl = host.querySelector(".gt-head");
  var scrollEl = host.querySelector(".gt-scroll");
  var canvasEl = host.querySelector(".gt-canvas");
  var hintEl = host.querySelector("[data-hint]");

  function childrenOf(pid) {
    var p = pid == null ? null : pid;
    return (cfg.tasks || []).filter(function (t) { return (t.parent_id == null ? null : t.parent_id) === p; });
  }
  function byId(id) {
    var l = cfg.tasks || [];
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function col(t) { return cfg.colorOf ? cfg.colorOf(t) : (t.color || "#7C5CFF"); }
  function buildRows() {
    var out = [];
    (function walk(pid, depth) {
      childrenOf(pid).forEach(function (t) {
        out.push({ t: t, depth: depth });
        if (!self.collapsed[t.id]) walk(t.id, depth + 1);
      });
    })(null, 0);
    return out;
  }
  function spanOf(t) {
    var kids = childrenOf(t.id);
    if (t.type === "group" && kids.length) {
      var s = null, e = null;
      kids.forEach(function (k) {
        var sp = spanOf(k);
        if (s === null || sp[0] < s) s = sp[0];
        if (e === null || sp[1] > e) e = sp[1];
      });
      return [s, e];
    }
    var a = parseDate(t.start_date), b = parseDate(t.end_date);
    if (b < a) b = a;
    return [a, b];
  }
  var progMap = {};
  function computeProgress() {
    progMap = {};
    function calc(t) {
      if (progMap[t.id] !== undefined) return progMap[t.id];
      var kids = childrenOf(t.id);
      if (t.type === "group" && kids.length) {
        var sp = 0, sw = 0;
        kids.forEach(function (k) {
          var kk = spanOf(k);
          var d = Math.max(1, diffDays(kk[0], kk[1]) + 1);
          sp += calc(k) * d; sw += d;
        });
        progMap[t.id] = sw ? Math.round(sp / sw) : 0;
      } else {
        progMap[t.id] = Math.max(0, Math.min(100, Number(t.progress) || 0));
      }
      return progMap[t.id];
    }
    (cfg.tasks || []).forEach(calc);
  }
  var attCount = {}, attRoll = {};
  function computeAttachments() {
    attCount = {};
    (cfg.attachments || []).forEach(function (a) {
      if (a.task_id == null) return;
      attCount[a.task_id] = (attCount[a.task_id] || 0) + 1;
    });
    attRoll = {};
    function roll(t) {
      if (attRoll[t.id] !== undefined) return attRoll[t.id];
      var n = attCount[t.id] || 0;
      childrenOf(t.id).forEach(function (k) { n += roll(k); });
      attRoll[t.id] = n;
      return n;
    }
    (cfg.tasks || []).forEach(roll);
  }
  function computeRange() {
    var min = null, max = null;
    (cfg.tasks || []).forEach(function (t) {
      var sp = spanOf(t);
      if (min === null || sp[0] < min) min = sp[0];
      if (max === null || sp[1] > max) max = sp[1];
    });
    if (min === null) { min = addDays(today(), -3); max = addDays(today(), 21); }
    min = addDays(min, -2); max = addDays(max, 2);
    while (min.getDay() !== 1) min = addDays(min, -1);
    while (max.getDay() !== 0) max = addDays(max, 1);
    return { start: min, end: max };
  }

  /* ---------- 渲染 ---------- */
  function render() {
    var rows = buildRows();
    var rg = computeRange();
    var px = ZOOM[self.zoom] || ZOOM.day;
    view = { start: rg.start, end: rg.end, px: px };
    computeProgress();
    computeAttachments();
    var days = diffDays(rg.start, rg.end) + 1;
    var W = Math.max(days * px, 320);
    var H = Math.max(rows.length * ROWH, 1);

    var st = leftBody.scrollTop, sl = scrollEl.scrollLeft, stp = scrollEl.scrollTop;

    root.classList.toggle("gt-linkmode", !!cfg.linkMode);
    var linkBtn = root.querySelector("[data-act=link]");
    if (linkBtn) linkBtn.classList.toggle("on", !!cfg.linkMode);

    if (!rows.length) {
      leftBody.innerHTML = '<div class="empty" style="padding:34px 12px"><div class="e">🌱</div><b>还没有任务</b><div class="small">点击右下角「新建任务」开始吧</div></div>';
    } else {
      var lh = "";
      rows.forEach(function (r) {
        var t = r.t;
        var kids = childrenOf(t.id);
        var p = progMap[t.id] || 0;
        var sel = self.selected === t.id ? " sel" : "";
        var overdue = t.status !== "done" && t.type !== "group" && parseDate(t.end_date) < today();
        var color = col(t);
        var pinned = cfg.pendingLink === t.id ? " pending" : "";
        var na = attRoll[t.id] || 0;
        var isDone = (t.type === "group") ? (p === 100 && kids.length > 0) : (t.status === "done");
        lh += '<div class="grow' + sel + '" data-id="' + t.id + '">';
        lh += '<div class="gc nm" style="padding-left:' + (9 + r.depth * 16) + 'px">';
        lh += '<button class="caret' + (kids.length ? "" : " hide") + '" data-act="toggle">' + (self.collapsed[t.id] ? "▸" : "▾") + '</button>';
        lh += '<span style="width:9px;height:9px;border-radius:3px;flex:none;background:' + color + '"></span>';
        if (t.type === "milestone") lh += '<span style="color:' + color + ';font-size:10px;flex:none">◆</span>';
        lh += '<span class="tn" title="' + attr(t.name) + '">' + esc(t.name) + '</span>';
        if (isDone) lh += '<span class="mk done" title="已完成">✓</span>';
        if (na) lh += '<span class="mk att" title="' + (kids.length ? "含子任务共 " : "") + na + ' 个附件">📎 ' + na + '</span>';
        if (overdue) lh += '<span class="chip red" style="padding:1px 6px;font-size:10px">逾期</span>';
        lh += '<div class="ra"><button data-act="att" title="附件">📎</button><button data-act="add" title="子任务">＋</button><button data-act="edit" title="编辑">✎</button><button data-act="del" title="删除">✕</button></div>';
        lh += '</div>';
        var isGrp = (t.type === "group" && kids.length > 0);
        var spn = spanOf(t);
        var sdTxt = fmtDate(spn[0]).slice(5);
        var edTxt = fmtDate(spn[1]).slice(5);
        lh += '<div class="gc cd"' + (isGrp ? "" : " data-f='start_date' title='双击修改开始日期'") + '">' + sdTxt + '</div>';
        lh += '<div class="gc cd"' + (isGrp ? "" : " data-f='end_date' title='双击修改结束日期'") + '">' + edTxt + '</div>';
        lh += '<div class="gc cp"' + (isGrp ? "" : " data-f='progress' title='双击修改进度'") + '"><div class="progress sm" style="width:26px"><i style="width:' + p + '%;background:' + color + '"></i></div>' + p + '%</div>';
        lh += '</div>';
      });
      leftBody.innerHTML = lh;
    }

    headEl.style.width = W + "px";
    headEl.innerHTML = headerHTML(rg.start, rg.end, px);
    updateZoomUI();

    var bg = "";
    if (px >= 11) {
      for (var i = 0; i < days; i++) {
        var wd = addDays(rg.start, i).getDay();
        if (wd === 0 || wd === 6) bg += '<i class="gcol" style="left:' + (i * px) + 'px;width:' + px + 'px"></i>';
      }
    }
    var ti = diffDays(rg.start, today());
    if (ti >= 0 && ti <= days) bg += '<i class="gtoday" style="left:' + (ti * px + px / 2) + 'px"></i>';

    pos = {};
    var bars = "";
    rows.forEach(function (r, idx) {
      var t = r.t;
      var sp = spanOf(t);
      var x1 = diffDays(rg.start, sp[0]) * px;
      var x2 = (diffDays(rg.start, sp[1]) + 1) * px;
      var cy = idx * ROWH + ROWH / 2;
      var kids = childrenOf(t.id);
      var sel = self.selected === t.id ? " sel" : "";
      var pinned = cfg.pendingLink === t.id ? " pending" : "";
      var color = col(t);
      var na2 = attRoll[t.id] || 0;
      var done2 = (t.type === "group") ? ((progMap[t.id] || 0) === 100 && kids.length > 0) : (t.status === "done");
      var mksuf = (done2 ? "  ✓" : "") + (na2 ? "  📎" + na2 : "");
      if (t.type === "milestone") {
        var cx = x1 + px / 2;
        pos[t.id] = { x1: cx, x2: cx, y: cy, h: 9 };
        bars += '<div class="gms' + sel + pinned + '" data-id="' + t.id + '" style="left:' + cx + 'px;top:' + cy + 'px;--c:' + color + '">' +
          '<i></i><span class="gl2">' + esc(t.name) + mksuf + '</span></div>';
      } else if (t.type === "group" && kids.length) {
        var w = Math.max(px, x2 - x1);
        pos[t.id] = { x1: x1, x2: x1 + w, y: cy, h: 6 };
        bars += '<div class="gbar summary' + sel + pinned + '" data-id="' + t.id + '" style="left:' + x1 + 'px;width:' + w + 'px;top:' + cy + 'px;--c:' + color + '">' +
          '<i class="gs"></i><span class="gl out">' + esc(t.name) + mksuf + '</span></div>';
      } else {
        var w2 = Math.max(px * 0.5, x2 - x1);
        var p = progMap[t.id] || 0;
        pos[t.id] = { x1: x1, x2: x1 + w2, y: cy, h: 10.5 };
        var out = w2 < 86 ? " out" : "";
        var hasB = mksuf && w2 >= 76;
        bars += '<div class="gbar' + sel + pinned + (hasB ? " hasb" : "") + '" data-id="' + t.id + '" style="left:' + x1 + 'px;width:' + w2 + 'px;top:' + cy + 'px;--c:' + color + '">' +
          '<i class="gf" style="width:' + p + '%"></i>' +
          '<span class="gl' + out + '">' + esc(t.name) + '</span>' +
          (hasB ? '<span class="gbadges">' + (done2 ? "<i>✓</i>" : "") + (na2 ? "<i>📎" + na2 + "</i>" : "") + '</span>' : "") +
          '<i class="gh l" data-mode="l"></i><i class="gh r" data-mode="r"></i></div>';
      }
    });

    canvasEl.style.width = W + "px";
    canvasEl.style.height = H + "px";
    canvasEl.innerHTML = bg + '<svg class="gdeps" width="' + W + '" height="' + H + '">' + depPaths() + '</svg>' + bars;
    canvasEl.style.backgroundImage =
      "repeating-linear-gradient(to right, var(--border-2) 0 1px, transparent 1px " + (px * (self.zoom === "month" ? 7 : 1)) + "px)," +
      "repeating-linear-gradient(to bottom, var(--border-2) 0 1px, transparent 1px " + ROWH + "px)";

    leftBody.scrollTop = st;
    scrollEl.scrollTop = stp;
    scrollEl.scrollLeft = sl;
    headWrap.scrollLeft = sl;

    if (hintEl) {
      if (cfg.linkMode) hintEl.textContent = cfg.pendingLink ? "已选起点，再点一个任务完成连线" : "连线模式：先点起点任务，再点终点任务";
      else hintEl.textContent = "拖拽条形改日期 · 双击条/名称打开任务 · 点日期或进度可直接改";
    }
  }

  function headerHTML(start, end, px) {
    var months = "";
    var cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (cur <= end) {
      var mEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
      var segEnd = mEnd < end ? mEnd : end;
      var w = (diffDays(cur, segEnd) + 1) * px;
      months += '<div class="gm" style="width:' + w + 'px">' + cur.getFullYear() + "年" + (cur.getMonth() + 1) + "月</div>";
      cur = addDays(segEnd, 1);
    }
    var dcs = "";
    var n = diffDays(start, end);
    for (var i = 0; i <= n; i++) {
      var d = addDays(start, i);
      var wd = d.getDay();
      var label = "";
      if (self.zoom === "day") label = d.getDate();
      else if (self.zoom === "week") { if (wd === 1) label = (d.getMonth() + 1) + "/" + d.getDate(); }
      else { if (d.getDate() === 1) label = (d.getMonth() + 1) + "月"; }
      dcs += '<div class="gd' + (wd === 0 || wd === 6 ? " we" : "") + '" style="width:' + px + 'px">' + label + '</div>';
    }
    return '<div class="ghr m">' + months + '</div><div class="ghr">' + dcs + '</div>';
  }

  /* 平滑曲线：从源任务右侧连到目标任务左侧 */
  function curve(a, b) {
    var x1 = a.x2, y1 = a.y, x2 = b.x1, y2 = b.y;
    var dx, dy;
    if (x2 - x1 >= 24) {
      dx = Math.max(26, Math.min(140, (x2 - x1) * 0.55));
      return "M" + x1 + "," + y1 + " C" + (x1 + dx) + "," + y1 + " " + (x2 - dx) + "," + y2 + " " + x2 + "," + y2;
    }
    dx = 52;
    dy = (y2 >= y1) ? 34 : -34;
    return "M" + x1 + "," + y1 + " C" + (x1 + dx) + "," + (y1 + dy * 0.2) + " " + (x1 + dx) + "," + (y2 + dy) + " " + (x1 + dx * 0.6) + "," + y2 + " L" + x2 + "," + y2;
  }

  function depPaths() {
    var out = '<defs>' +
      '<marker id="garw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">' +
      '<path d="M0,0 L10,5 L0,10 z" style="fill:var(--depc)"></path></marker>' +
      '</defs>';
    (cfg.links || []).forEach(function (l) {
      var a = pos[l.source_id], b = pos[l.target_id];
      if (!a || !b) return;
      var d = curve(a, b);
      out += '<g class="glink" data-link="' + l.id + '">' +
        '<path class="gdep" d="' + d + '" marker-end="url(#garw)"></path>' +
        '<path class="gdep-hit" d="' + d + '"></path>' +
        '</g>';
    });
    return out;
  }

  function updateZoomUI() {
    Array.prototype.slice.call(root.querySelectorAll("[data-zoom] button")).forEach(function (b) {
      b.classList.toggle("on", b.dataset.z === self.zoom);
    });
  }

  function updateSelection() {
    Array.prototype.slice.call(leftBody.querySelectorAll(".grow")).forEach(function (r) {
      r.classList.toggle("sel", Number(r.dataset.id) === self.selected);
    });
    Array.prototype.slice.call(canvasEl.querySelectorAll(".gbar, .gms")).forEach(function (b) {
      b.classList.toggle("sel", Number(b.dataset.id) === self.selected);
    });
  }

  /* ---------- 拖拽 ---------- */
  function startDrag(e, node) {
    var id = Number(node.dataset.id);
    var t = byId(id);
    if (!t) return;
    e.preventDefault();
    self.selected = id;
    if (cfg.onSelect) cfg.onSelect(id);
    updateSelection();
    var mode = (e.target.dataset && e.target.dataset.mode) ? e.target.dataset.mode : "move";
    var kids = childrenOf(id);
    if (t.type === "milestone" || (t.type === "group" && kids.length)) mode = "move";
    var p0 = pos[id];
    if (!p0) return;
    var sp = spanOf(t);
    var os = sp[0], oe = sp[1];
    var sx = e.clientX;
    dragging = { id: id, mode: mode, dd: 0 };
    document.body.classList.add("gdrag");
    var tip = document.getElementById("tip");
    function tipShow(ev, text) {
      if (!tip) return;
      tip.textContent = text;
      tip.style.left = (ev.clientX + 14) + "px";
      tip.style.top = (ev.clientY - 34) + "px";
      tip.classList.add("on");
    }
    function tipHide() { if (tip) tip.classList.remove("on"); }
    function mv(ev) {
      var dd = Math.round((ev.clientX - sx) / view.px);
      dragging.dd = dd;
      if (mode === "move") {
        node.style.left = (p0.x1 + dd * view.px) + "px";
        tipShow(ev, fmtDate(addDays(os, dd)) + "  →  " + fmtDate(addDays(oe, dd)));
      } else if (mode === "r") {
        var w = Math.max(view.px, (p0.x2 - p0.x1) + dd * view.px);
        node.style.width = w + "px";
        tipShow(ev, String(t.start_date) + "  →  " + fmtDate(addDays(oe, dd)));
      } else {
        var w2 = Math.max(view.px, (p0.x2 - p0.x1) - dd * view.px);
        node.style.width = w2 + "px";
        node.style.left = (p0.x2 - w2) + "px";
        tipShow(ev, fmtDate(addDays(os, dd)) + "  →  " + String(t.end_date));
      }
    }
    function up(ev) {
      document.removeEventListener("mousemove", mv);
      document.removeEventListener("mouseup", up);
      document.body.classList.remove("gdrag");
      tipHide();
      var dd = dragging ? dragging.dd : 0;
      dragging = null;
      if (!dd) { updateSelection(); return; }
      var ns = os, ne = oe;
      if (mode === "move") { ns = addDays(os, dd); ne = addDays(oe, dd); }
      else if (mode === "r") { ne = addDays(oe, dd); if (ne < os) ne = os; }
      else { ns = addDays(os, dd); if (ns > oe) ns = oe; }
      if (cfg.onDatesChange) cfg.onDatesChange(id, fmtDate(ns), fmtDate(ne));
    }
    document.addEventListener("mousemove", mv);
    document.addEventListener("mouseup", up);
  }

  /* ---------- 事件 ---------- */
  canvasEl.addEventListener("mousedown", function (e) {
    if (e.button !== 0) return;
    var node = e.target.closest(".gbar, .gms");
    if (cfg.linkMode) {
      if (node) { e.preventDefault(); if (cfg.onLinkPick) cfg.onLinkPick(Number(node.dataset.id)); }
      return;
    }
    if (node) { startDrag(e, node); return; }
    if (self.selected != null) { self.selected = null; if (cfg.onSelect) cfg.onSelect(null); updateSelection(); }
  });
  canvasEl.addEventListener("click", function (e) {
    var g = e.target.closest(".glink");
    if (g && cfg.onLinkDelete) cfg.onLinkDelete(Number(g.dataset.link));
  });
  canvasEl.addEventListener("dblclick", function (e) {
    var node = e.target.closest(".gbar, .gms");
    if (node && cfg.onEdit) cfg.onEdit(Number(node.dataset.id));
  });
  leftBody.addEventListener("click", function (e) {
    var row = e.target.closest(".grow");
    if (!row) return;
    var id = Number(row.dataset.id);
    var act = e.target.closest("[data-act]");
    if (act) {
      var a = act.dataset.act;
      if (a === "toggle") { self.collapsed[id] = !self.collapsed[id]; if (cfg.onCollapseChange) cfg.onCollapseChange(self.collapsed); render(); return; }
      if (a === "add" && cfg.onAddChild) { cfg.onAddChild(id); return; }
      if (a === "edit" && cfg.onEdit) { cfg.onEdit(id); return; }
      if (a === "att" && cfg.onEdit) { cfg.onEdit(id, true); return; }
      if (a === "del" && cfg.onDelete) { cfg.onDelete(id); return; }
    }
    if (self.selected !== id) {
      self.selected = id;
      if (cfg.onSelect) cfg.onSelect(id);
    }
    updateSelection();
  });
  function startInlineEdit(cell, id) {
    if (cell.querySelector("input")) return;
    var t = byId(Number(id));
    if (!t) return;
    var field = cell.dataset.f;
    var old = cell.innerHTML;
    cell.classList.add("editing");
    if (field === "progress") {
      cell.innerHTML = '<input class="inline n" type="number" min="0" max="100" step="5" value="' + (Number(t.progress) || 0) + '">';
    } else {
      cell.innerHTML = '<input class="inline d" type="date" value="' + String(t[field] || "").slice(0, 10) + '">';
    }
    var input = cell.querySelector("input");
    input.focus();
    if (input.select) input.select();
    var done = false;
    function restore() { cell.innerHTML = old; cell.classList.remove("editing"); }
    function commit(save) {
      if (done) return;
      done = true;
      var v = input.value;
      restore();
      if (!save || v === "") return;
      if (field === "progress") {
        var n = Math.max(0, Math.min(100, Number(v) || 0));
        if (n === (Number(t.progress) || 0)) return;
        if (cfg.onInlineEdit) cfg.onInlineEdit(Number(id), "progress", n);
      } else {
        if (v === String(t[field] || "").slice(0, 10)) return;
        if (cfg.onInlineEdit) cfg.onInlineEdit(Number(id), field, v);
      }
    }
    input.addEventListener("blur", function () { commit(true); });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
      else if (ev.key === "Escape") { ev.preventDefault(); done = true; restore(); }
    });
  }
  leftBody.addEventListener("dblclick", function (e) {
    var cell = e.target.closest(".gc.cd, .gc.cp");
    var row = e.target.closest(".grow");
    if (!row) return;
    if (cell && !e.target.closest("input")) { startInlineEdit(cell, row.dataset.id); return; }
    if (cfg.onEdit) cfg.onEdit(Number(row.dataset.id));
  });
  scrollEl.addEventListener("scroll", function () {
    leftBody.scrollTop = scrollEl.scrollTop;
    headWrap.scrollLeft = scrollEl.scrollLeft;
  });
  leftBody.addEventListener("scroll", function () { scrollEl.scrollTop = leftBody.scrollTop; });
  root.addEventListener("click", function (e) {
    var z = e.target.closest("[data-zoom] button");
    if (z) { self.zoom = z.dataset.z; if (cfg.onZoom) cfg.onZoom(self.zoom); render(); return; }
    var act = e.target.closest("[data-act]");
    if (!act) return;
    var a = act.dataset.act;
    if (a === "link" && cfg.onToggleLink) { cfg.onToggleLink(); return; }
    if (a === "expand") { (cfg.tasks || []).forEach(function (t) { self.collapsed[t.id] = false; }); if (cfg.onCollapseChange) cfg.onCollapseChange(self.collapsed); render(); }
    if (a === "collapse") { (cfg.tasks || []).forEach(function (t) { self.collapsed[t.id] = true; }); if (cfg.onCollapseChange) cfg.onCollapseChange(self.collapsed); render(); }
    if (a === "today") scrollToday();
  });

  function scrollToday() {
    var x = diffDays(view.start, today()) * view.px;
    var target = Math.max(0, x - scrollEl.clientWidth * 0.35);
    scrollEl.scrollLeft = target;
    headWrap.scrollLeft = target;
  }

  render();

  return {
    render: render,
    setData: function (tasks, links, attachments) { cfg.tasks = tasks; cfg.links = links; cfg.attachments = attachments; render(); },
    setSelected: function (id) { self.selected = id; render(); },
    setLinkState: function (mode, pending) { cfg.linkMode = mode; cfg.pendingLink = pending; render(); },
    scrollToday: scrollToday
  };
}
