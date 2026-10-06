"use strict";
/*
 * 极简 ZIP 读写（仅使用 Node 内置 zlib）
 * 支持：deflate / store，UTF-8 文件名，目录结构
 */

var zlib = require("zlib");

var CRC_TABLE = (function () {
  var t = new Int32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosTime(d) {
  return ((d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)) & 0xFFFF;
}
function dosDate(d) {
  return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
}

/* entries: [{ name, data(Buffer|string), date(Date)? }]  ->  Buffer */
function createZip(entries) {
  var parts = [];
  var central = [];
  var offset = 0;
  var now = new Date();

  entries.forEach(function (e) {
    var nameBuf = Buffer.from(String(e.name), "utf8");
    var data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data == null ? "" : String(e.data), "utf8");
    var dt = e.date instanceof Date ? e.date : now;

    var compressed = zlib.deflateRawSync(data, { level: 6 });
    var stored = compressed.length >= data.length;
    var payload = stored ? data : compressed;
    var method = stored ? 0 : 8;

    var lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(dosTime(dt), 10);
    lh.writeUInt16LE(dosDate(dt), 12);
    lh.writeUInt32LE(crc32(data), 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    parts.push(lh, nameBuf, payload);

    var ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(dosTime(dt), 12);
    ch.writeUInt16LE(dosDate(dt), 14);
    ch.writeUInt32LE(crc32(data), 16);
    ch.writeUInt32LE(payload.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + payload.length;
  });

  var centralBuf = Buffer.concat(central);
  var eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat(parts.concat([centralBuf, eocd]));
}

/* Buffer -> [{ name, data(Buffer) }] */
function readZip(buf) {
  if (!buf || buf.length < 22) throw new Error("文件内容为空或不是有效的 ZIP");
  var start = Math.max(0, buf.length - 65557);
  var i = buf.length - 22;
  while (i >= start && buf.readUInt32LE(i) !== 0x06054b50) i--;
  if (i < start) throw new Error("不是有效的 ZIP 备份文件");

  var count = buf.readUInt16LE(i + 10);
  var cdOffset = buf.readUInt32LE(i + 16);
  var out = [];
  var p = cdOffset;

  for (var k = 0; k < count; k++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break;
    var method = buf.readUInt16LE(p + 10);
    var compSize = buf.readUInt32LE(p + 20);
    var nameLen = buf.readUInt16LE(p + 28);
    var extraLen = buf.readUInt16LE(p + 30);
    var commentLen = buf.readUInt16LE(p + 32);
    var localOff = buf.readUInt32LE(p + 42);
    var name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");

    var lNameLen = buf.readUInt16LE(localOff + 26);
    var lExtraLen = buf.readUInt16LE(localOff + 28);
    var dataStart = localOff + 30 + lNameLen + lExtraLen;
    var raw = buf.slice(dataStart, dataStart + compSize);
    var data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error("不支持的压缩方式: " + method);

    if (name.charAt(name.length - 1) !== "/") out.push({ name: name, data: data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

module.exports = { createZip: createZip, readZip: readZip, crc32: crc32 };
