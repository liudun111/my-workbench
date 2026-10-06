"use strict";
/*
 * 我的工作台 - 个人项目工作台 后端
 * Node.js 内置模块 + node:sqlite + 自研 ZIP，零第三方依赖
 */

var http = require("http");
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var child_process = require("child_process");
var zip = require("./zip.js");

var ROOT = __dirname;
var PUBLIC_DIR = path.join(ROOT, "public");
var DATA_DIR = path.join(ROOT, "data");
var FILES_DIR = path.join(DATA_DIR, "files");
var DB_FILE = path.join(DATA_DIR, "workbench.db");
var PORT = parseInt(process.env.PORT || "4180", 10);
var HOST = process.env.HOST || "127.0.0.1";
var NO_OPEN = process.argv.indexOf("--no-open") >= 0;
var NL = String.fromCharCode(10);

process.on("warning", function (w) {
  if (w && w.name === "ExperimentalWarning" && String(w.message).indexOf("SQLite") >= 0) return;
  console.warn(w.message);
});

var DatabaseSync;
try {
  DatabaseSync = require("node:sqlite").DatabaseSync;
} catch (e) {
  if (!process.env.PMS_SQLITE_FLAG) {
    try {
      var cp0 = require("child_process");
      var args0 = ["--experimental-sqlite"].concat(process.argv.slice(1));
      var env0 = Object.assign({}, process.env, { PMS_SQLITE_FLAG: "1" });
      var res0 = cp0.spawnSync(process.execPath, args0, { stdio: "inherit", env: env0 });
      process.exit(res0.status == null ? 1 : res0.status);
    } catch (e2) { }
  }
  console.error("");
  console.error("  [!] 当前 Node.js 不支持内置 SQLite 模块 (node:sqlite)。");
  console.error("      当前版本: " + process.version + "，请升级到 Node.js 22.5 或更高版本。");
  console.error("");
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(FILES_DIR, { recursive: true });

function openDatabase() {
  var d = new DatabaseSync(DB_FILE);
  d.exec("PRAGMA journal_mode = WAL");
  d.exec("PRAGMA foreign_keys = ON");
  d.exec("PRAGMA busy_timeout = 8000");
  return d;
}
var db = openDatabase();

/* ---------------------------------------------------------- 基础工具 */
function pad2(n) { return n < 10 ? "0" + n : "" + n; }
function fmtDate(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
function todayStr() { return fmtDate(new Date()); }
function nowStr() {
  var d = new Date();
  return fmtDate(d) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
}
function parseD(s) {
  var p = String(s || "").split("-");
  return new Date(Number(p[0]) || 1970, (Number(p[1]) || 1) - 1, Number(p[2]) || 1);
}
function dayDiff(a, b) {
  return Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}
function num(v, def) { var n = Number(v); return isFinite(n) ? n : (def || 0); }
function str(v) { return v == null ? "" : String(v); }
function httpError(status, message) { var e = new Error(message); e.status = status; return e; }
function lastId(info) { return Number(info.lastInsertRowid); }
function safeName(n) {
  var s = str(n || "file").split("/").join("_").split(String.fromCharCode(92)).join("_");
  s = s.split(":").join("_").split("*").join("_").split("?").join("_");
  s = s.split('"').join("_").split("<").join("_").split(">").join("_").split("|").join("_");
  return s.trim() || "file";
}
function dbSize(file) {
  var total = 0;
  [file, file + "-wal", file + "-shm"].forEach(function (f) {
    try { total += fs.statSync(f).size; } catch (e) { }
  });
  return total;
}
function dirSize(dir) {
  var total = 0;
  try {
    fs.readdirSync(dir).forEach(function (f) {
      try { total += fs.statSync(path.join(dir, f)).size; } catch (e) { }
    });
  } catch (e) { }
  return total;
}

/* ---------------------------------------------------------- 数据表 */
function migrate() {
  var cols = db.prepare("PRAGMA table_info(tasks)").all().map(function (r) { return r.name; });
  if (cols.indexOf("color_mode") < 0) db.exec("ALTER TABLE tasks ADD COLUMN color_mode TEXT DEFAULT 'auto'");
}

function createSchema() {
  db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");

  db.exec("CREATE TABLE IF NOT EXISTS projects (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "name TEXT NOT NULL," +
    "description TEXT DEFAULT ''," +
    "emoji TEXT DEFAULT '📁'," +
    "color TEXT DEFAULT '#7C5CFF'," +
    "status TEXT DEFAULT 'active'," +
    "priority TEXT DEFAULT 'medium'," +
    "start_date TEXT," +
    "end_date TEXT," +
    "tags TEXT DEFAULT ''," +
    "created_at TEXT," +
    "updated_at TEXT)");

  db.exec("CREATE TABLE IF NOT EXISTS tasks (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE," +
    "parent_id INTEGER," +
    "name TEXT NOT NULL," +
    "type TEXT DEFAULT 'task'," +
    "start_date TEXT," +
    "end_date TEXT," +
    "progress INTEGER DEFAULT 0," +
    "status TEXT DEFAULT 'todo'," +
    "priority TEXT DEFAULT 'medium'," +
    "color TEXT DEFAULT '#7C5CFF'," +
    "color_mode TEXT DEFAULT 'auto'," +
    "notes TEXT DEFAULT ''," +
    "sort_order INTEGER DEFAULT 0," +
    "created_at TEXT," +
    "updated_at TEXT)");

  db.exec("CREATE TABLE IF NOT EXISTS links (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE," +
    "source_id INTEGER NOT NULL," +
    "target_id INTEGER NOT NULL," +
    "type TEXT DEFAULT 'FS'," +
    "created_at TEXT)");

  db.exec("CREATE TABLE IF NOT EXISTS attachments (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE," +
    "task_id INTEGER," +
    "name TEXT NOT NULL," +
    "stored_name TEXT NOT NULL," +
    "size INTEGER DEFAULT 0," +
    "mime TEXT DEFAULT ''," +
    "created_at TEXT)");

  db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_links_project ON links(project_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_att_project ON attachments(project_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_att_task ON attachments(task_id)");
}

/* ---------------------------------------------------------- 设置 */
var DEFAULT_SETTINGS = {
  app_name: "我的工作台",
  nickname: "我的",
  avatar: "🌱",
  accent: "#7C5CFF",
  theme: "light",
  week_start: "1",
  default_zoom: "day",
  home_motto: "把想法拆成今天能做完的一小步。"
};
function getSetting(key, def) {
  var row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : (def !== undefined ? def : DEFAULT_SETTINGS[key]);
}
function setSetting(key, value) { db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").run(key, String(value)); }
function allSettings() {
  var out = Object.assign({}, DEFAULT_SETTINGS);
  db.prepare("SELECT key, value FROM settings").all().forEach(function (r) { out[r.key] = r.value; });
  return out;
}

/* ---------------------------------------------------------- 种子数据 */
var SEED_COLORS = ["#7C5CFF", "#3ECFA0", "#FF7A9A", "#FFB020", "#4CC3F0", "#FF8A5C", "#B07CFF", "#2FBFA8"];

function seedDatabase() {
  if (Number(db.prepare("SELECT COUNT(*) AS c FROM projects").get().c) > 0) return;

  var t0 = new Date();
  function d(n) { return fmtDate(addDays(t0, n)); }

  var data = [
    {
      name: "记账助手 App", emoji: "🚀", color: "#7C5CFF", status: "active", priority: "high",
      start: -12, end: 58, tags: "自研,移动端",
      description: "给自己做一款顺手的记账应用：极简记账、图表统计、云端同步。",
      tasks: [
        { k: "g1", n: "需求与规划", t: "group", s: 0, e: 9, c: "#7C5CFF" },
        { k: "m1", p: "g1", n: "正式立项", t: "milestone", s: 0, e: 0, st: "done", pg: 100, c: "#FF8A5C" },
        { k: "a1", p: "g1", n: "竞品调研", s: 1, e: 5, st: "done", pg: 100, c: "#7C5CFF" },
        { k: "a2", p: "g1", n: "功能清单与原型", s: 5, e: 9, st: "done", pg: 100, c: "#7C5CFF" },
        { k: "g2", n: "视觉设计", t: "group", s: 9, e: 18, c: "#FF7A9A" },
        { k: "b1", p: "g2", n: "风格与配色定义", s: 9, e: 13, st: "done", pg: 100, c: "#FF7A9A" },
        { k: "b2", p: "g2", n: "关键页面设计", s: 12, e: 18, st: "doing", pg: 60, c: "#FF7A9A" },
        { k: "g3", n: "开发实现", t: "group", s: 17, e: 44, c: "#4CC3F0" },
        { k: "c1", p: "g3", n: "数据模型设计", s: 17, e: 21, st: "doing", pg: 80, c: "#4CC3F0" },
        { k: "c2", p: "g3", n: "记账核心功能", s: 21, e: 32, st: "doing", pg: 35, c: "#3ECFA0" },
        { k: "c3", p: "g3", n: "图表统计模块", s: 30, e: 40, st: "todo", pg: 0, c: "#FFB020" },
        { k: "c4", p: "g3", n: "云端同步", s: 36, e: 44, st: "todo", pg: 0, c: "#B07CFF" },
        { k: "g4", n: "测试与发布", t: "group", s: 42, e: 54, c: "#3ECFA0" },
        { k: "e1", p: "g4", n: "自测与缺陷修复", s: 42, e: 50, st: "todo", pg: 0, c: "#3ECFA0" },
        { k: "e2", p: "g4", n: "上架应用商店", t: "milestone", s: 54, e: 54, st: "todo", pg: 0, c: "#FF8A5C" }
      ],
      links: [["a2", "b1"], ["b1", "b2"], ["b2", "c1"], ["c1", "c2"], ["c2", "c3"], ["c1", "c4"], ["c3", "e1"], ["c4", "e1"], ["e1", "e2"]],
      files: [
        { task: "a2", name: "需求笔记.md", text: "# 记账助手 · 需求笔记\n\n## 核心目标\n- 3 秒完成一笔记账\n- 自动生成月度图表\n- 数据可导出\n\n## 暂不做\n- 多账户共享\n- 发票识别\n" },
        { task: "c1", name: "数据表设计.md", text: "# 数据模型\n\n- accounts(id, name, type, balance)\n- records(id, amount, category, note, happened_at)\n- categories(id, name, icon, color)\n" }
      ]
    },
    {
      name: "2026 技术成长计划", emoji: "📖", color: "#3ECFA0", status: "active", priority: "medium",
      start: -30, end: 180, tags: "学习,长期",
      description: "系统补齐基础知识，保持每周稳定投入，年底能独立完成一个开源项目。",
      tasks: [
        { k: "g1", n: "基础巩固", t: "group", s: -30, e: 30, c: "#3ECFA0" },
        { k: "a1", p: "g1", n: "算法与数据结构", s: -30, e: 20, st: "doing", pg: 55, c: "#3ECFA0" },
        { k: "a2", p: "g1", n: "计算机网络", s: -10, e: 25, st: "doing", pg: 30, c: "#4CC3F0" },
        { k: "a3", p: "g1", n: "操作系统原理", s: 20, e: 60, st: "todo", pg: 0, c: "#B07CFF" },
        { k: "g2", n: "工程实践", t: "group", s: 30, e: 130, c: "#FFB020" },
        { k: "b1", p: "g2", n: "重构个人项目", s: 30, e: 75, st: "todo", pg: 0, c: "#FFB020" },
        { k: "b2", p: "g2", n: "参与开源社区", s: 60, e: 130, st: "todo", pg: 0, c: "#FF8A5C" },
        { k: "g3", n: "输出与复盘", t: "group", s: 50, e: 180, c: "#FF7A9A" },
        { k: "c1", p: "g3", n: "技术博客 12 篇", s: 50, e: 180, st: "todo", pg: 8, c: "#FF7A9A" },
        { k: "m1", p: null, n: "读完 6 本书", t: "milestone", s: 180, e: 180, st: "todo", pg: 0, c: "#FF8A5C" }
      ],
      links: [["a1", "b1"], ["a2", "b1"], ["b1", "b2"], ["b1", "c1"], ["c1", "m1"]],
      files: [{ task: "a1", name: "学习路线.md", text: "# 学习路线\n\n1. 数组 / 链表 / 树 / 图\n2. 动态规划\n3. 每周 5 题，坚持 12 周\n" }]
    },
    {
      name: "个人网站改版", emoji: "🎨", color: "#B07CFF", status: "planning", priority: "low",
      start: 14, end: 70, tags: "设计,前端",
      description: "把用了三年的旧站点重做一遍：更干净的排版、暗色模式、作品集页面。",
      tasks: [
        { k: "g1", n: "设计与内容", t: "group", s: 14, e: 34, c: "#B07CFF" },
        { k: "a1", p: "g1", n: "收集参考与灵感", s: 14, e: 21, st: "todo", pg: 0, c: "#B07CFF" },
        { k: "a2", p: "g1", n: "重写个人简介", s: 20, e: 30, st: "todo", pg: 0, c: "#FF7A9A" },
        { k: "a3", p: "g1", n: "整理作品集", s: 26, e: 34, st: "todo", pg: 0, c: "#FFB020" },
        { k: "g2", n: "开发上线", t: "group", s: 34, e: 66, c: "#4CC3F0" },
        { k: "b1", p: "g2", n: "页面开发", s: 34, e: 54, st: "todo", pg: 0, c: "#4CC3F0" },
        { k: "b2", p: "g2", n: "部署与域名", s: 52, e: 62, st: "todo", pg: 0, c: "#3ECFA0" },
        { k: "m1", p: null, n: "新站上线", t: "milestone", s: 66, e: 66, st: "todo", pg: 0, c: "#FF8A5C" }
      ],
      links: [["a1", "a2"], ["a2", "a3"], ["a3", "b1"], ["b1", "b2"], ["b2", "m1"]],
      files: []
    },
    {
      name: "京都旅行计划", emoji: "✈️", color: "#FFB020", status: "active", priority: "medium",
      start: -6, end: 40, tags: "生活,旅行",
      description: "十一月红叶季去京都待七天，重点是东山、岚山和宇治。",
      tasks: [
        { k: "g1", n: "行前准备", t: "group", s: -6, e: 20, c: "#FFB020" },
        { k: "a1", p: "g1", n: "确定出行日期", s: -6, e: -3, st: "done", pg: 100, c: "#FFB020" },
        { k: "a2", p: "g1", n: "订机票", s: -3, e: 2, st: "doing", pg: 50, c: "#FF8A5C" },
        { k: "a3", p: "g1", n: "订住宿", s: 0, e: 8, st: "doing", pg: 20, c: "#3ECFA0" },
        { k: "a4", p: "g1", n: "办理签证", s: 4, e: 20, st: "todo", pg: 0, c: "#4CC3F0" },
        { k: "g2", n: "行程规划", t: "group", s: 8, e: 32, c: "#FF7A9A" },
        { k: "b1", p: "g2", n: "东山一日路线", s: 8, e: 18, st: "todo", pg: 0, c: "#FF7A9A" },
        { k: "b2", p: "g2", n: "岚山与宇治", s: 14, e: 26, st: "todo", pg: 0, c: "#B07CFF" },
        { k: "b3", p: "g2", n: "美食清单", s: 20, e: 32, st: "todo", pg: 0, c: "#FFB020" },
        { k: "m1", p: null, n: "出发 ✈️", t: "milestone", s: 40, e: 40, st: "todo", pg: 0, c: "#FF8A5C" }
      ],
      links: [["a1", "a2"], ["a2", "a3"], ["a3", "a4"], ["a4", "m1"], ["b1", "b2"], ["b2", "b3"], ["b3", "m1"]],
      files: [{ task: "b1", name: "东山路线草稿.md", text: "# 东山一日\n\n清水寺 → 二年坂 → 三年坂 → 高台寺 → 八坂神社 → 祇园\n" }]
    }
  ];

  var insProj = db.prepare("INSERT INTO projects (name,description,emoji,color,status,priority,start_date,end_date,tags,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
  var insTask = db.prepare("INSERT INTO tasks (project_id,parent_id,name,type,start_date,end_date,progress,status,priority,color,notes,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  var insLink = db.prepare("INSERT INTO links (project_id,source_id,target_id,type,created_at) VALUES (?,?,?,?,?)");
  var insAtt = db.prepare("INSERT INTO attachments (project_id,task_id,name,stored_name,size,mime,created_at) VALUES (?,?,?,?,?,?,?)");

  data.forEach(function (p) {
    var info = insProj.run(p.name, p.description, p.emoji, p.color, p.status, p.priority,
      d(p.start), d(p.end), p.tags || "", nowStr(), nowStr());
    var pid = lastId(info);
    var map = {};
    p.tasks.forEach(function (t, idx) {
      var parentId = t.p ? (map[t.p] || null) : null;
      var ti = insTask.run(pid, parentId, t.n, t.t || "task", d(t.s), d(t.e), num(t.pg, 0),
        t.st || "todo", t.pr || "medium", t.c || p.color, "", idx, nowStr(), nowStr());
      map[t.k] = lastId(ti);
    });
    (p.links || []).forEach(function (l) {
      if (map[l[0]] && map[l[1]]) insLink.run(pid, map[l[0]], map[l[1]], "FS", nowStr());
    });
    (p.files || []).forEach(function (f) {
      var taskId = map[f.task] || null;
      var stored = crypto.randomBytes(8).toString("hex") + "_" + safeName(f.name);
      fs.writeFileSync(path.join(FILES_DIR, stored), f.text, "utf8");
      insAtt.run(pid, taskId, f.name, stored, Buffer.byteLength(f.text, "utf8"), "text/markdown; charset=utf-8", nowStr());
    });
  });

  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { setSetting(k, DEFAULT_SETTINGS[k]); });
}

/* ---------------------------------------------------------- 项目/任务计算 */
function loadTasks(projectId) {
  return db.prepare("SELECT * FROM tasks WHERE project_id = ? ORDER BY sort_order ASC, id ASC").all(projectId);
}
function loadLinks(projectId) {
  return db.prepare("SELECT * FROM links WHERE project_id = ? ORDER BY id ASC").all(projectId);
}
function loadAttachments(projectId) {
  return db.prepare("SELECT id, project_id, task_id, name, size, mime, created_at FROM attachments WHERE project_id = ? ORDER BY id DESC").all(projectId);
}
function progressMap(tasks) {
  var kids = {};
  tasks.forEach(function (t) {
    var p = t.parent_id == null ? "root" : t.parent_id;
    if (!kids[p]) kids[p] = [];
    kids[p].push(t);
  });
  var memo = {};
  function calc(t) {
    if (memo[t.id] !== undefined) return memo[t.id];
    var ch = kids[t.id] || [];
    if (t.type === "group" && ch.length) {
      var sp = 0, sw = 0;
      ch.forEach(function (k) {
        var dur = Math.max(1, dayDiff(parseD(k.start_date), parseD(k.end_date)) + 1);
        sp += calc(k) * dur; sw += dur;
      });
      memo[t.id] = sw ? Math.round(sp / sw) : 0;
    } else {
      memo[t.id] = Math.max(0, Math.min(100, Number(t.progress) || 0));
    }
    return memo[t.id];
  }
  tasks.forEach(function (t) { calc(t); });
  return memo;
}
function decorateProject(p) {
  var tasks = loadTasks(p.id);
  var prog = progressMap(tasks);
  var leaves = tasks.filter(function (t) { return t.type !== "group"; });
  var done = leaves.filter(function (t) { return t.status === "done"; }).length;
  var doing = leaves.filter(function (t) { return t.status === "doing"; }).length;
  var today = todayStr();
  var overdue = leaves.filter(function (t) { return t.status !== "done" && t.end_date < today; }).length;
  var attCount = Number(db.prepare("SELECT COUNT(*) AS c FROM attachments WHERE project_id = ?").get(p.id).c);
  var linkCount = Number(db.prepare("SELECT COUNT(*) AS c FROM links WHERE project_id = ?").get(p.id).c);
  var sum = 0, cnt = 0;
  leaves.filter(function (t) { return t.type === "task"; }).forEach(function (t) { sum += prog[t.id] || 0; cnt++; });
  var res = {};
  Object.keys(p).forEach(function (k) { res[k] = p[k]; });
  res.task_count = leaves.filter(function (t) { return t.type === "task"; }).length;
  res.milestone_count = tasks.filter(function (t) { return t.type === "milestone"; }).length;
  res.done_count = done;
  res.doing_count = doing;
  res.overdue_count = overdue;
  res.attachment_count = attCount;
  res.link_count = linkCount;
  res.progress = cnt ? Math.round(sum / cnt) : 0;
  return res;
}
function listProjects() {
  return db.prepare("SELECT * FROM projects ORDER BY id DESC").all().map(decorateProject);
}

/* ---------------------------------------------------------- HTTP 辅助 */
function sendJson(res, code, obj) {
  var body = Buffer.from(JSON.stringify(obj), "utf8");
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store"
  });
  res.end(body);
}
function sendError(res, err) {
  var status = err && err.status ? err.status : 500;
  if (status >= 500) console.error("[错误] " + (err && err.stack ? err.stack : err));
  sendJson(res, status, { error: err && err.message ? err.message : "服务器内部错误" });
}
function readBody(req, limit) {
  return new Promise(function (resolve, reject) {
    var chunks = [], size = 0, max = limit || 8 * 1024 * 1024;
    req.on("data", function (c) {
      size += c.length;
      if (size > max) { reject(httpError(413, "文件过大")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", function () { resolve(Buffer.concat(chunks)); });
    req.on("error", reject);
  });
}
function parseJson(buf) {
  if (!buf || !buf.length) return {};
  try { return JSON.parse(buf.toString("utf8")); }
  catch (e) { throw httpError(400, "请求数据格式错误"); }
}
function buildUpdate(table, cols, data, id) {
  var sets = [], vals = [];
  cols.forEach(function (c) {
    if (Object.prototype.hasOwnProperty.call(data, c)) { sets.push(c + " = ?"); vals.push(data[c]); }
  });
  if (!sets.length) return null;
  vals.push(id);
  return { sql: "UPDATE " + table + " SET " + sets.join(", ") + " WHERE id = ?", vals: vals };
}
function runUpdate(u) {
  if (!u) return 0;
  var stmt = db.prepare(u.sql);
  var info = stmt.run.apply(stmt, u.vals);
  return Number(info.changes);
}
function taskDescendants(id) {
  var out = [], stack = [id];
  while (stack.length) {
    var cur = stack.pop();
    db.prepare("SELECT id FROM tasks WHERE parent_id = ?").all(cur).forEach(function (k) { out.push(k.id); stack.push(k.id); });
  }
  return out;
}
function asciiName(name) {
  var s = safeName(name), out = "";
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    out += (c >= 32 && c < 127) ? s.charAt(i) : "_";
  }
  return out;
}
/* 由子任务汇总父阶段/分组的起止日期，保持数据一致 */
function syncGroupDates(projectId) {
  if (!projectId) return;
  var tasks = db.prepare("SELECT id, parent_id, type, start_date, end_date FROM tasks WHERE project_id = ?").all(projectId);
  var byParent = {};
  tasks.forEach(function (t) {
    var p = t.parent_id == null ? "root" : t.parent_id;
    if (!byParent[p]) byParent[p] = [];
    byParent[p].push(t);
  });
  var memo = {};
  function calc(t) {
    if (memo[t.id]) return memo[t.id];
    var kids = byParent[t.id] || [];
    if (!kids.length) return null;
    var a = null, b = null;
    kids.forEach(function (k) {
      var r = calc(k);
      if (!r) { r = [k.start_date, k.end_date]; if (r[1] < r[0]) r[1] = r[0]; }
      if (a === null || r[0] < a) a = r[0];
      if (b === null || r[1] > b) b = r[1];
    });
    memo[t.id] = [a, b];
    return memo[t.id];
  }
  var upd = db.prepare("UPDATE tasks SET start_date = ?, end_date = ? WHERE id = ?");
  tasks.forEach(function (t) {
    var r = calc(t);
    if (r && (r[0] !== t.start_date || r[1] !== t.end_date)) upd.run(r[0], r[1], t.id);
  });
}
function repairAllGroupDates() {
  db.prepare("SELECT id FROM projects").all().forEach(function (p) { syncGroupDates(p.id); });
}

function contentDisposition(name) {
  return 'attachment; filename="' + asciiName(name) + '"; filename*=UTF-8' + String.fromCharCode(39, 39) + encodeURIComponent(name);
}

/* ---------------------------------------------------------- 导出 / 导入 */
function csvCell(v) {
  var s = str(v);
  if (s.indexOf(",") >= 0 || s.indexOf(String.fromCharCode(34)) >= 0 || s.indexOf(NL) >= 0) {
    s = String.fromCharCode(34) + s.split(String.fromCharCode(34)).join(String.fromCharCode(34, 34)) + String.fromCharCode(34);
  }
  return s;
}
var TASK_STATUS_TEXT = { todo: "待办", doing: "进行中", done: "已完成", paused: "搁置" };
var TASK_TYPE_TEXT = { task: "任务", group: "阶段", milestone: "里程碑" };
function tasksCsv(projectName, tasks) {
  var head = ["项目", "任务名称", "类型", "开始日期", "结束日期", "进度(%)", "状态", "优先级", "备注"];
  var lines = [head.join(",")];
  tasks.forEach(function (t) {
    lines.push([
      csvCell(projectName), csvCell(t.name), csvCell(TASK_TYPE_TEXT[t.type] || t.type),
      csvCell(t.start_date), csvCell(t.end_date), csvCell(t.progress),
      csvCell(TASK_STATUS_TEXT[t.status] || t.status), csvCell(t.priority), csvCell(t.notes || "")
    ].join(","));
  });
  return lines.join(NL);
}
function stripTask(t) {
  var o = {};
  Object.keys(t).forEach(function (k) { o[k] = t[k]; });
  return o;
}
function projectBundle(pid) {
  var p = db.prepare("SELECT * FROM projects WHERE id = ?").get(pid);
  if (!p) throw httpError(404, "项目不存在");
  var tasks = loadTasks(pid);
  var links = loadLinks(pid);
  var atts = db.prepare("SELECT * FROM attachments WHERE project_id = ? ORDER BY id DESC").all(pid);
  var entries = [];
  var attMeta = [];
  atts.forEach(function (a) {
    var file = "attachments/" + a.id + "_" + safeName(a.name);
    attMeta.push({ task_id: a.task_id, name: a.name, size: a.size, mime: a.mime, created_at: a.created_at, file: file });
    var f = path.join(FILES_DIR, a.stored_name);
    if (fs.existsSync(f)) entries.push({ name: file, data: fs.readFileSync(f) });
  });
  var meta = {
    type: "workbench-project",
    version: 1,
    exported_at: nowStr(),
    project: p,
    tasks: tasks.map(stripTask),
    links: links.map(function (l) { return { source_id: l.source_id, target_id: l.target_id, type: l.type }; }),
    attachments: attMeta
  };
  entries.unshift({ name: "tasks.csv", data: tasksCsv(p.name, tasks) });
  entries.unshift({ name: "project.json", data: JSON.stringify(meta, null, 2) });
  entries.push({
    name: "README.txt",
    data: "这是我用「我的工作台」导出的项目备份。" + NL + NL +
      "项目：" + p.name + NL +
      "导出时间：" + nowStr() + NL +
      "任务数：" + tasks.length + NL +
      "依赖连线：" + links.length + NL +
      "附件： " + attMeta.length + " 个（保存在 attachments/ 目录）" + NL + NL +
      "在「设置 → 数据管理 → 导入项目备份」中选择本文件即可恢复。" + NL
  });
  return { project: p, entries: entries, attachments: attMeta.length, tasks: tasks.length, links: links.length };
}
function importProjectBuffer(buf) {
  var files = zip.readZip(buf);
  var metaFile = null;
  files.forEach(function (f) { if (f.name === "project.json") metaFile = f; });
  if (!metaFile) throw httpError(400, "备份文件中缺少 project.json，可能不是本系统导出的备份");
  var meta;
  try { meta = JSON.parse(metaFile.data.toString("utf8")); }
  catch (e) { throw httpError(400, "备份文件已损坏（project.json 解析失败）"); }
  var p = meta.project || {};
  var info = db.prepare("INSERT INTO projects (name,description,emoji,color,status,priority,start_date,end_date,tags,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(str(p.name) || "未命名项目", str(p.description), str(p.emoji) || "📁", str(p.color) || "#7C5CFF",
      str(p.status) || "active", str(p.priority) || "medium", str(p.start_date) || todayStr(),
      str(p.end_date) || todayStr(), str(p.tags), nowStr(), nowStr());
  var newPid = lastId(info);
  var insTask = db.prepare("INSERT INTO tasks (project_id,parent_id,name,type,start_date,end_date,progress,status,priority,color,notes,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  var idMap = {};
  var pending = (meta.tasks || []).slice();
  var guard = 0;
  while (pending.length && guard++ < 60) {
    var next = [];
    pending.forEach(function (t) {
      var parentId = null;
      if (t.parent_id != null) {
        if (idMap[t.parent_id] === undefined) { next.push(t); return; }
        parentId = idMap[t.parent_id];
      }
      var ti = insTask.run(newPid, parentId, str(t.name) || "未命名任务", str(t.type) || "task",
        str(t.start_date) || todayStr(), str(t.end_date) || todayStr(), num(t.progress, 0),
        str(t.status) || "todo", str(t.priority) || "medium", str(t.color) || "#7C5CFF",
        str(t.notes), num(t.sort_order, 0), nowStr(), nowStr());
      idMap[t.id] = lastId(ti);
    });
    if (next.length === pending.length) break;
    pending = next;
  }
  var insLink = db.prepare("INSERT INTO links (project_id,source_id,target_id,type,created_at) VALUES (?,?,?,?,?)");
  (meta.links || []).forEach(function (l) {
    var s = idMap[l.source_id], t = idMap[l.target_id];
    if (s && t && s !== t) insLink.run(newPid, s, t, str(l.type) || "FS", nowStr());
  });
  var insAtt = db.prepare("INSERT INTO attachments (project_id,task_id,name,stored_name,size,mime,created_at) VALUES (?,?,?,?,?,?,?)");
  var byName = {};
  files.forEach(function (f) { byName[f.name] = f; });
  (meta.attachments || []).forEach(function (a) {
    var f = a.file ? byName[a.file] : null;
    if (!f) return;
    var stored = crypto.randomBytes(8).toString("hex") + "_" + safeName(a.name);
    fs.writeFileSync(path.join(FILES_DIR, stored), f.data);
    insAtt.run(newPid, a.task_id != null && idMap[a.task_id] ? idMap[a.task_id] : null,
      str(a.name) || "附件", stored, f.data.length, str(a.mime) || "application/octet-stream", nowStr());
  });
  syncGroupDates(newPid);
  return newPid;
}
function workspaceBundle() {
  var json = {
    type: "workbench-workspace",
    version: 1,
    exported_at: nowStr(),
    settings: allSettings(),
    projects: db.prepare("SELECT * FROM projects").all(),
    tasks: db.prepare("SELECT * FROM tasks").all(),
    links: db.prepare("SELECT * FROM links").all(),
    attachments: []
  };
  var entries = [];
  db.prepare("SELECT * FROM attachments").all().forEach(function (a) {
    var file = "files/" + a.id + "_" + safeName(a.name);
    json.attachments.push({ id: a.id, project_id: a.project_id, task_id: a.task_id, name: a.name, size: a.size, mime: a.mime, created_at: a.created_at, file: file });
    var f = path.join(FILES_DIR, a.stored_name);
    if (fs.existsSync(f)) entries.push({ name: file, data: fs.readFileSync(f) });
  });
  entries.unshift({ name: "workspace.json", data: JSON.stringify(json, null, 2) });
  return entries;
}
function importWorkspaceBuffer(buf) {
  var files = zip.readZip(buf);
  var metaFile = null;
  files.forEach(function (f) { if (f.name === "workspace.json") metaFile = f; });
  if (!metaFile) throw httpError(400, "备份中缺少 workspace.json");
  var meta = JSON.parse(metaFile.data.toString("utf8"));
  try { db.exec("DELETE FROM attachments"); db.exec("DELETE FROM links"); db.exec("DELETE FROM tasks"); db.exec("DELETE FROM projects"); } catch (e) { }
  try { db.exec("DELETE FROM sqlite_sequence WHERE name IN ('projects','tasks','links','attachments')"); } catch (e) { }
  var insProj = db.prepare("INSERT INTO projects (id,name,description,emoji,color,status,priority,start_date,end_date,tags,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  (meta.projects || []).forEach(function (p) {
    insProj.run(p.id, p.name, p.description, p.emoji, p.color, p.status, p.priority, p.start_date, p.end_date, p.tags, p.created_at || nowStr(), p.updated_at || nowStr());
  });
  var insTask = db.prepare("INSERT INTO tasks (id,project_id,parent_id,name,type,start_date,end_date,progress,status,priority,color,notes,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  (meta.tasks || []).forEach(function (t) {
    insTask.run(t.id, t.project_id, t.parent_id, t.name, t.type, t.start_date, t.end_date, t.progress, t.status, t.priority, t.color, t.notes || "", t.sort_order || 0, t.created_at || nowStr(), t.updated_at || nowStr());
  });
  var insLink = db.prepare("INSERT INTO links (id,project_id,source_id,target_id,type,created_at) VALUES (?,?,?,?,?,?)");
  (meta.links || []).forEach(function (l) {
    insLink.run(l.id, l.project_id, l.source_id, l.target_id, l.type || "FS", l.created_at || nowStr());
  });
  var insAtt = db.prepare("INSERT INTO attachments (id,project_id,task_id,name,stored_name,size,mime,created_at) VALUES (?,?,?,?,?,?,?,?)");
  var byName = {};
  files.forEach(function (f) { byName[f.name] = f; });
  (meta.attachments || []).forEach(function (a) {
    var f = a.file ? byName[a.file] : null;
    if (!f) return;
    var stored = crypto.randomBytes(8).toString("hex") + "_" + safeName(a.name);
    fs.writeFileSync(path.join(FILES_DIR, stored), f.data);
    insAtt.run(a.id, a.project_id, a.task_id, a.name, stored, f.data.length, a.mime || "", a.created_at || nowStr());
  });
  if (meta.settings) Object.keys(meta.settings).forEach(function (k) { setSetting(k, meta.settings[k]); });
  return { projects: (meta.projects || []).length, tasks: (meta.tasks || []).length, attachments: (meta.attachments || []).length };
}

/* ---------------------------------------------------------- 统计 */
function overviewStats() {
  var projects = listProjects();
  var tasks = db.prepare("SELECT * FROM tasks").all();
  var leaves = tasks.filter(function (t) { return t.type !== "group"; });
  var today = todayStr();
  var weekAgo = fmtDate(addDays(new Date(), -7));
  var overdue = leaves.filter(function (t) { return t.status !== "done" && t.end_date < today; });
  var focus = leaves.filter(function (t) {
    return t.status !== "done" && t.start_date <= today && t.end_date >= today;
  }).sort(function (a, b) { return a.end_date < b.end_date ? -1 : 1; }).slice(0, 6);
  var upcoming = leaves.filter(function (t) { return t.type === "milestone" && t.status !== "done" && t.end_date >= today; })
    .sort(function (a, b) { return a.end_date < b.end_date ? -1 : 1; }).slice(0, 5);
  var weekDone = leaves.filter(function (t) { return t.status === "done" && String(t.updated_at || "").slice(0, 10) >= weekAgo; }).length;
  var statusDist = { todo: 0, doing: 0, done: 0, paused: 0 };
  leaves.forEach(function (t) { statusDist[t.status] = (statusDist[t.status] || 0) + 1; });
  var recent = db.prepare("SELECT t.id, t.name, t.project_id, t.status, t.updated_at, p.name AS project_name, p.emoji AS project_emoji FROM tasks t LEFT JOIN projects p ON p.id = t.project_id ORDER BY t.updated_at DESC LIMIT 8").all();
  var sum = 0, cnt = 0;
  leaves.filter(function (t) { return t.type === "task"; }).forEach(function (t) { sum += Number(t.progress) || 0; cnt++; });
  return {
    summary: {
      projects: projects.length,
      active: projects.filter(function (p) { return p.status === "active"; }).length,
      tasks: leaves.filter(function (t) { return t.type === "task"; }).length,
      milestones: tasks.filter(function (t) { return t.type === "milestone"; }).length,
      done: leaves.filter(function (t) { return t.status === "done"; }).length,
      doing: leaves.filter(function (t) { return t.status === "doing"; }).length,
      overdue: overdue.length,
      week_done: weekDone,
      avg_progress: cnt ? Math.round(sum / cnt) : 0,
      attachments: Number(db.prepare("SELECT COUNT(*) AS c FROM attachments").get().c),
      links: Number(db.prepare("SELECT COUNT(*) AS c FROM links").get().c)
    },
    status_dist: statusDist,
    projects: projects,
    focus: focus,
    upcoming: upcoming,
    overdue_tasks: overdue.sort(function (a, b) { return a.end_date < b.end_date ? -1 : 1; }).slice(0, 6),
    recent: recent
  };
}

/* ---------------------------------------------------------- 静态资源 */
var MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8"
};
function serveStatic(req, res, url) {
  var rel = decodeURIComponent(url.pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  var resolved = path.resolve(path.join(PUBLIC_DIR, rel));
  if (resolved.indexOf(path.resolve(PUBLIC_DIR)) !== 0) {
    res.writeHead(403); res.end("403"); return;
  }
  fs.readFile(resolved, function (err, data) {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end("404 Not Found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(resolved).toLowerCase()] || "application/octet-stream", "Content-Length": data.length, "Cache-Control": "no-cache" });
    res.end(data);
  });
}

/* ---------------------------------------------------------- 路由 */
async function route(req, res, url) {
  var parts = url.pathname.split("/").filter(function (x) { return x.length > 0; });
  var query = url.searchParams;
  if (parts.length === 0 || parts[0] !== "api") { serveStatic(req, res, url); return; }

  var m = req.method;
  var r1 = parts[1] || "";
  var p2 = parts[2] || "";
  var id = /^[0-9]+$/.test(p2) ? Number(p2) : null;
  var action = p2;
  var sub = parts[3] || "";
  var body;

  if (r1 === "health") { sendJson(res, 200, { ok: true, time: nowStr(), version: "2.0.0" }); return; }

  if (r1 === "state" && m === "GET") {
    sendJson(res, 200, { settings: allSettings(), projects: listProjects(), stats: overviewStats() });
    return;
  }

  if (r1 === "settings") {
    if (m === "GET") { sendJson(res, 200, { settings: allSettings() }); return; }
    if (m === "PUT") {
      body = parseJson(await readBody(req));
      Object.keys(body).forEach(function (k) { setSetting(k, body[k]); });
      sendJson(res, 200, { settings: allSettings() });
      return;
    }
  }

  if (r1 === "stats" && action === "overview" && m === "GET") { sendJson(res, 200, overviewStats()); return; }

  if (r1 === "system" && action === "info" && m === "GET") {
    sendJson(res, 200, {
      node: process.version, platform: process.platform, arch: process.arch,
      memory: Math.round(require("os").totalmem() / 1073741824 * 10) / 10,
      uptime: Math.round(process.uptime()), db_file: DB_FILE, files_dir: FILES_DIR,
      db_size: dbSize(DB_FILE), files_size: dirSize(FILES_DIR), port: PORT, now: nowStr()
    });
    return;
  }

  /* ---------------- 项目 ---------------- */
  if (r1 === "projects") {
    if (m === "GET" && !id && action !== "import") { sendJson(res, 200, { projects: listProjects() }); return; }

    if (m === "POST" && action === "import") {
      var rawImp = await readBody(req, 300 * 1024 * 1024);
      var newPid = importProjectBuffer(rawImp);
      sendJson(res, 200, { project: decorateProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(newPid)) });
      return;
    }

    if (m === "GET" && id && sub !== "export") { sendJson(res, 200, { project: decorateProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id)), tasks: loadTasks(id), links: loadLinks(id), attachments: loadAttachments(id) }); return; }

    if (m === "POST") {
      body = parseJson(await readBody(req));
      if (!str(body.name).trim()) throw httpError(400, "请填写项目名称");
      var s = new Date();
      var sd = str(body.start_date) || fmtDate(s);
      var ed = str(body.end_date) || fmtDate(addDays(parseD(sd), 30));
      var info = db.prepare("INSERT INTO projects (name,description,emoji,color,status,priority,start_date,end_date,tags,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .run(str(body.name).trim(), str(body.description), str(body.emoji) || "📁", str(body.color) || "#7C5CFF",
          str(body.status) || "active", str(body.priority) || "medium", sd, ed, str(body.tags), nowStr(), nowStr());
      sendJson(res, 200, { project: decorateProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(lastId(info))) });
      return;
    }

    if (m === "PUT" && id) {
      body = parseJson(await readBody(req));
      var u = buildUpdate("projects", ["name", "description", "emoji", "color", "status", "priority", "start_date", "end_date", "tags"], body, id);
      if (u) {
        u.sql = u.sql.replace(" WHERE id = ?", ", updated_at = ? WHERE id = ?");
        u.vals.splice(u.vals.length - 1, 0, nowStr());
        runUpdate(u);
      }
      sendJson(res, 200, { project: decorateProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id)) });
      return;
    }

    if (m === "DELETE" && id) {
      var atts = db.prepare("SELECT stored_name FROM attachments WHERE project_id = ?").all(id);
      atts.forEach(function (a) { try { fs.unlinkSync(path.join(FILES_DIR, a.stored_name)); } catch (e) { } });
      db.prepare("DELETE FROM projects WHERE id = ?").run(id);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (id && sub === "export" && m === "GET") {
      var bundle = projectBundle(id);
      var buf = zip.createZip(bundle.entries);
      var fname = safeName(bundle.project.name) + "-" + todayStr() + ".zip";
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Length": buf.length,
        "Content-Disposition": contentDisposition(fname)
      });
      res.end(buf);
      return;
    }
  }

  /* ---------------- 任务 ---------------- */
  if (r1 === "tasks") {
    if (m === "GET" && !id) {
      var qpid = Number(query.get("project_id"));
      sendJson(res, 200, { tasks: qpid ? loadTasks(qpid) : db.prepare("SELECT * FROM tasks ORDER BY project_id, sort_order").all() });
      return;
    }
    if (m === "POST" && !id) {
      body = parseJson(await readBody(req));
      var tpid = Number(body.project_id);
      if (!tpid) throw httpError(400, "缺少项目");
      if (!str(body.name).trim()) throw httpError(400, "请填写任务名称");
      var cur = db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE project_id = ?").get(tpid).c;
      var ti = db.prepare("INSERT INTO tasks (project_id,parent_id,name,type,start_date,end_date,progress,status,priority,color,notes,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(tpid, body.parent_id ? Number(body.parent_id) : null, str(body.name).trim(), str(body.type) || "task",
          str(body.start_date) || todayStr(), str(body.end_date) || str(body.start_date) || todayStr(),
          num(body.progress, 0), str(body.status) || "todo", str(body.priority) || "medium",
          str(body.color) || "#7C5CFF", str(body.notes), Number(cur), nowStr(), nowStr());
      syncGroupDates(tpid);
      sendJson(res, 200, { task: db.prepare("SELECT * FROM tasks WHERE id = ?").get(lastId(ti)) });
      return;
    }
    if (m === "PUT" && id) {
      body = parseJson(await readBody(req));
      var tu = buildUpdate("tasks", ["parent_id", "name", "type", "start_date", "end_date", "progress", "status", "priority", "color", "color_mode", "notes", "sort_order"], body, id);
      if (tu) {
        tu.sql = tu.sql.replace(" WHERE id = ?", ", updated_at = ? WHERE id = ?");
        tu.vals.splice(tu.vals.length - 1, 0, nowStr());
        runUpdate(tu);
      }
      var trow = db.prepare("SELECT project_id FROM tasks WHERE id = ?").get(id);
      if (trow) syncGroupDates(trow.project_id);
      sendJson(res, 200, { task: db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) });
      return;
    }
    if (m === "DELETE" && id) {
      var delRow = db.prepare("SELECT project_id FROM tasks WHERE id = ?").get(id);
      var ids = [id].concat(taskDescendants(id));
      var atts2 = [];
      ids.forEach(function (x) {
        db.prepare("SELECT id, stored_name FROM attachments WHERE task_id = ?").all(x).forEach(function (a) { atts2.push(a); });
        db.prepare("DELETE FROM links WHERE source_id = ? OR target_id = ?").run(x, x);
        db.prepare("DELETE FROM tasks WHERE id = ?").run(x);
      });
      atts2.forEach(function (a) {
        try { fs.unlinkSync(path.join(FILES_DIR, a.stored_name)); } catch (e) { }
        db.prepare("DELETE FROM attachments WHERE id = ?").run(a.id);
      });
      if (delRow) syncGroupDates(delRow.project_id);
      sendJson(res, 200, { ok: true, removed: ids.length });
      return;
    }
    if (id && sub === "attachments" && m === "POST") {
      var task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
      if (!task) throw httpError(404, "任务不存在");
      var raw = await readBody(req, 300 * 1024 * 1024);
      if (!raw.length) throw httpError(400, "文件内容为空");
      var fname2 = "file";
      try { fname2 = decodeURIComponent(str(req.headers["x-file-name"] || "file")); } catch (e) { }
      fname2 = safeName(fname2);
      var stored2 = crypto.randomBytes(8).toString("hex") + "_" + fname2;
      fs.writeFileSync(path.join(FILES_DIR, stored2), raw);
      var ai = db.prepare("INSERT INTO attachments (project_id,task_id,name,stored_name,size,mime,created_at) VALUES (?,?,?,?,?,?,?)")
        .run(task.project_id, id, fname2, stored2, raw.length, str(req.headers["content-type"] || "application/octet-stream"), nowStr());
      sendJson(res, 200, { attachment: { id: lastId(ai), project_id: task.project_id, task_id: id, name: fname2, size: raw.length, mime: str(req.headers["content-type"] || ""), created_at: nowStr() } });
      return;
    }
  }

  /* ---------------- 依赖连线 ---------------- */
  if (r1 === "links") {
    if (m === "POST") {
      body = parseJson(await readBody(req));
      var lp = Number(body.project_id);
      var sid = Number(body.source_id), tid = Number(body.target_id);
      if (!lp || !sid || !tid) throw httpError(400, "参数不完整");
      if (sid === tid) throw httpError(400, "不能连接到自己");
      var a = db.prepare("SELECT * FROM tasks WHERE id = ?").get(sid);
      var b = db.prepare("SELECT * FROM tasks WHERE id = ?").get(tid);
      if (!a || !b || a.project_id !== lp || b.project_id !== lp) throw httpError(400, "任务不属于该项目");
      var dup = db.prepare("SELECT id FROM links WHERE project_id = ? AND source_id = ? AND target_id = ?").get(lp, sid, tid);
      if (dup) throw httpError(400, "这两条任务之间已经有连线了");
      var li = db.prepare("INSERT INTO links (project_id,source_id,target_id,type,created_at) VALUES (?,?,?,?,?)")
        .run(lp, sid, tid, str(body.type) || "FS", nowStr());
      sendJson(res, 200, { link: db.prepare("SELECT * FROM links WHERE id = ?").get(lastId(li)) });
      return;
    }
    if (m === "DELETE" && id) {
      db.prepare("DELETE FROM links WHERE id = ?").run(id);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (m === "GET") {
      var qlp = Number(query.get("project_id"));
      sendJson(res, 200, { links: qlp ? loadLinks(qlp) : db.prepare("SELECT * FROM links").all() });
      return;
    }
  }

  /* ---------------- 附件 ---------------- */
  if (r1 === "attachments") {
    if (m === "GET" && !id) {
      sendJson(res, 200, {
        attachments: db.prepare("SELECT a.id, a.project_id, a.task_id, a.name, a.size, a.mime, a.created_at, " +
          "p.name AS project_name, p.emoji AS project_emoji, p.color AS project_color, t.name AS task_name " +
          "FROM attachments a LEFT JOIN projects p ON p.id = a.project_id LEFT JOIN tasks t ON t.id = a.task_id " +
          "ORDER BY a.id DESC").all()
      });
      return;
    }
    if (sub === "download" && id && m === "GET") {
      var att = db.prepare("SELECT * FROM attachments WHERE id = ?").get(id);
      if (!att) throw httpError(404, "附件不存在");
      var fp = path.join(FILES_DIR, att.stored_name);
      if (!fs.existsSync(fp)) throw httpError(404, "附件文件已丢失");
      var fdata = fs.readFileSync(fp);
      var cd = contentDisposition(att.name);
      var inline = query.get("inline") === "1";
      res.writeHead(200, {
        "Content-Type": att.mime || "application/octet-stream",
        "Content-Length": fdata.length,
        "Content-Disposition": inline ? ("inline" + cd.slice("attachment".length)) : cd
      });
      res.end(fdata);
      return;
    }
    if (m === "DELETE" && id) {
      var a3 = db.prepare("SELECT * FROM attachments WHERE id = ?").get(id);
      if (a3) { try { fs.unlinkSync(path.join(FILES_DIR, a3.stored_name)); } catch (e) { } }
      db.prepare("DELETE FROM attachments WHERE id = ?").run(id);
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  /* ---------------- 整体备份 / 导出 ---------------- */
  if (r1 === "backup") {
    if (action === "export" && m === "GET") {
      var entries = workspaceBundle();
      var b2 = zip.createZip(entries);
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Length": b2.length,
        "Content-Disposition": contentDisposition("workbench-backup-" + todayStr() + ".zip")
      });
      res.end(b2);
      return;
    }
    if (action === "import" && m === "POST") {
      var rawW = await readBody(req, 500 * 1024 * 1024);
      var result = importWorkspaceBuffer(rawW);
      sendJson(res, 200, { ok: true, result: result });
      return;
    }
  }

  if (r1 === "export" && action === "tasks.csv" && m === "GET") {
    var cpid = Number(query.get("project_id"));
    var proj = cpid ? db.prepare("SELECT * FROM projects WHERE id = ?").get(cpid) : null;
    var tlist = cpid ? loadTasks(cpid) : db.prepare("SELECT t.*, p.name AS pname FROM tasks t JOIN projects p ON p.id = t.project_id ORDER BY t.project_id, t.sort_order").all();
    var csv = cpid ? tasksCsv(proj ? proj.name : "", tlist) :
      (function () {
        var lines = [["项目", "任务名称", "类型", "开始日期", "结束日期", "进度(%)", "状态", "优先级", "备注"].join(",")];
        tlist.forEach(function (t) {
          lines.push([csvCell(t.pname), csvCell(t.name), csvCell(TASK_TYPE_TEXT[t.type] || t.type), csvCell(t.start_date), csvCell(t.end_date), csvCell(t.progress), csvCell(TASK_STATUS_TEXT[t.status] || t.status), csvCell(t.priority), csvCell(t.notes || "")].join(","));
        });
        return lines.join(NL);
      })();
    var cb = Buffer.from(String.fromCharCode(0xFEFF) + csv, "utf8");
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Length": cb.length, "Content-Disposition": contentDisposition("tasks-" + todayStr() + ".csv") });
    res.end(cb);
    return;
  }

  throw httpError(404, "接口不存在：" + url.pathname);
}

/* ---------------------------------------------------------- 启动 */
createSchema();
migrate();
seedDatabase();
repairAllGroupDates();

var server = http.createServer(function (req, res) {
  var url;
  try { url = new URL(req.url, "http://" + (req.headers.host || "localhost")); }
  catch (e) { res.writeHead(400); res.end("Bad Request"); return; }
  Promise.resolve().then(function () { return route(req, res, url); })
    .catch(function (err) {
      if (res.headersSent) { try { res.end(); } catch (e) { } return; }
      sendError(res, err);
    });
});

server.on("error", function (err) {
  if (err && err.code === "EADDRINUSE") {
    console.log("  端口 " + PORT + " 已被占用，尝试 " + (PORT + 1) + " ...");
    PORT = PORT + 1;
    server.listen(PORT, HOST);
  } else { console.error(err); process.exit(1); }
});

function openBrowser(url) {
  try {
    if (process.platform === "darwin") child_process.exec('open "' + url + '"');
    else if (process.platform === "win32") child_process.exec('start "" "' + url + '"');
    else child_process.exec('xdg-open "' + url + '"');
  } catch (e) { }
}

server.listen(PORT, HOST, function () {
  var url = "http://" + (HOST === "0.0.0.0" ? "localhost" : HOST) + ":" + PORT;
  console.log("");
  console.log("  ============================================================");
  console.log("    我的工作台 · 个人项目工作台 已启动");
  console.log("  ============================================================");
  console.log("    访问地址 : " + url);
  console.log("    数据目录 : " + DATA_DIR);
  console.log("    附件目录 : " + FILES_DIR);
  console.log("    Node 版本: " + process.version + "  (" + process.platform + "/" + process.arch + ")");
  console.log("  ------------------------------------------------------------");
  console.log("    数据与附件全部保存在本机，无需登录，按 Ctrl + C 停止");
  console.log("");
  if (!NO_OPEN) openBrowser(url);
});
