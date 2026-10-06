/* ============================================================
   API 与全局状态（个人版：无登录）
   ============================================================ */
export var state = {
  settings: {},
  projects: [],
  stats: null,
  project: null,
  tasks: [],
  links: [],
  attachments: [],
  allAttachments: [],
  view: "overview",
  zoom: "day",
  selectedTask: null,
  linkMode: false,
  pendingLink: null
};

export async function request(method, path, body, raw, extraHeaders) {
  var init = { method: method, headers: {}, credentials: "same-origin" };
  if (extraHeaders) Object.keys(extraHeaders).forEach(function (k) { init.headers[k] = extraHeaders[k]; });
  if (body !== undefined && body !== null) {
    if (raw) init.body = body;
    else { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
  }
  var res;
  try { res = await fetch(path, init); }
  catch (e) { throw new Error("无法连接本地服务，请确认已运行启动脚本"); }
  var text = await res.text();
  var data = null;
  if (text) { try { data = JSON.parse(text); } catch (e) { data = null; } }
  if (!res.ok) throw new Error(data && data.error ? data.error : ("请求失败 (" + res.status + ")"));
  return data;
}

export var get = function (p) { return request("GET", p); };
export var post = function (p, b) { return request("POST", p, b); };
export var put = function (p, b) { return request("PUT", p, b); };
export var del = function (p) { return request("DELETE", p); };

export function uploadFile(taskId, file) {
  return request("POST", "/api/tasks/" + taskId + "/attachments", file, true, {
    "x-file-name": encodeURIComponent(file.name),
    "Content-Type": file.type || "application/octet-stream"
  });
}
