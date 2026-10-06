/* ============================================================
   纯 SVG 图表（无第三方依赖）
   ============================================================ */

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

export function ring(percent, color, size, stroke, label) {
  size = size || 62; stroke = stroke || 7;
  var p = clamp(Number(percent) || 0, 0, 100);
  var r = (size - stroke) / 2;
  var c = 2 * Math.PI * r;
  var off = c * (1 - p / 100);
  var txt = label != null ? label : (Math.round(p) + "%");
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--panel-3)" stroke-width="' + stroke + '"/>' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + stroke +
    '" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + off +
    '" transform="rotate(-90 ' + (size / 2) + ' ' + (size / 2) + ')"/>' +
    '<text x="50%" y="50%" dy="' + (size * 0.09) + '" text-anchor="middle" font-size="' + (size * 0.25) +
    '" font-weight="700" fill="var(--text)">' + txt + '</text>' +
    '</svg>';
}

export function donut(items, opts) {
  opts = opts || {};
  var size = opts.size || 168;
  var thickness = opts.thickness || 22;
  var total = items.reduce(function (a, b) { return a + (Number(b.value) || 0); }, 0);
  var r = (size - thickness) / 2;
  var c = 2 * Math.PI * r;
  var off = 0;
  var svg = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="flex:none">';
  svg += '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--panel-3)" stroke-width="' + thickness + '"/>';
  svg += '<g transform="rotate(-90 ' + (size / 2) + ' ' + (size / 2) + ')">';
  items.forEach(function (it) {
    var v = Number(it.value) || 0;
    if (!v || !total) return;
    var len = c * (v / total);
    svg += '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + it.color +
      '" stroke-width="' + thickness + '" stroke-dasharray="' + Math.max(0, len - 2) + ' ' + (c - len + 2) +
      '" stroke-dashoffset="' + (-off) + '"/>';
    off += len;
  });
  svg += '</g>';
  svg += '<text x="50%" y="47%" text-anchor="middle" font-size="24" font-weight="800" fill="var(--text)">' + (opts.centerValue != null ? opts.centerValue : total) + '</text>';
  svg += '<text x="50%" y="62%" text-anchor="middle" font-size="11" fill="var(--muted)">' + (opts.centerLabel || "") + '</text>';
  svg += '</svg>';
  return svg;
}

/* 水平条形列表（HTML） */
export function hbars(items, opts) {
  opts = opts || {};
  var max = opts.max || items.reduce(function (a, b) { return Math.max(a, Number(b.value) || 0); }, 0) || 1;
  var html = '<div>';
  items.forEach(function (it) {
    var w = Math.round((Number(it.value) || 0) / max * 100);
    html += '<div class="wl-row">';
    html += '<div class="nm">' + (it.label || "") + '</div>';
    html += '<div class="bars"><i style="width:' + w + '%;background:' + (it.color || "var(--primary)") + '"></i></div>';
    html += '<div class="n">' + (it.value) + '</div>';
    html += '</div>';
  });
  if (!items.length) html += '<div class="muted small" style="padding:14px 0">暂无数据</div>';
  return html + '</div>';
}

/* 垂直柱状图（SVG） */
export function vbars(items, opts) {
  opts = opts || {};
  var W = opts.width || 560, H = opts.height || 200;
  var padL = 34, padR = 12, padT = 16, padB = 34;
  var max = items.reduce(function (a, b) { return Math.max(a, Number(b.value) || 0); }, 0) || 1;
  var iw = W - padL - padR, ih = H - padT - padB;
  var step = items.length ? iw / items.length : iw;
  var bw = Math.min(38, step * 0.55);
  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" preserveAspectRatio="xMidYMid meet">';
  for (var g = 0; g <= 4; g++) {
    var gy = padT + ih * g / 4;
    svg += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="var(--border-2)"/>';
    svg += '<text x="' + (padL - 8) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="10" fill="var(--muted)">' +
      Math.round(max * (4 - g) / 4) + '</text>';
  }
  items.forEach(function (it, i) {
    var v = Number(it.value) || 0;
    var h = ih * (v / max);
    var x = padL + step * i + (step - bw) / 2;
    var y = padT + ih - h;
    svg += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + Math.max(2, h) + '" rx="6" fill="' + (it.color || "var(--primary)") + '"/>';
    svg += '<text x="' + (x + bw / 2) + '" y="' + (y - 6) + '" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text-2)">' + v + '</text>';
    svg += '<text x="' + (x + bw / 2) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="10.5" fill="var(--muted)">' + (it.label || "") + '</text>';
  });
  svg += '</svg>';
  return svg;
}

/* 堆叠条（HTML）：展示成员任务构成 */
export function stacked(item) {
  var parts = item.parts || [];
  var total = parts.reduce(function (a, b) { return a + (Number(b.value) || 0); }, 0) || 1;
  var html = '<div style="display:flex;height:8px;border-radius:5px;overflow:hidden;background:var(--panel-3)">';
  parts.forEach(function (p) {
    var w = (Number(p.value) || 0) / total * 100;
    if (w <= 0) return;
    html += '<i style="width:' + w + '%;background:' + p.color + '" title="' + (p.label || "") + '"></i>';
  });
  return html + '</div>';
}
