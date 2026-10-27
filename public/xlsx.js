/* Tarayıcıda Excel (.xlsx) üretir — harici kütüphane gerekmez.
   window.XLSX.build({ users, history, version }) -> Uint8Array ;  window.XLSX.download(bytes, dosyaAdı) */
(function () {
  'use strict';
  var COMPANY = 'WOVATEK MÜHENDİSLİK';
  var STATUS_TR = { ok: 'Bugün onayladı', old: 'Süresi doldu', none: 'Hiç onaylamadı' };
  var enc = new TextEncoder();

  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(buf) { var c = 0xFFFFFFFF; for (var i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  // ZIP (sıkıştırmasız "store" yöntemi — Excel bunu sorunsuz açar)
  function makeZip(files) {
    var chunks = [], central = [], off = 0, total = 0;
    function push(a) { chunks.push(a); total += a.length; }
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      push(new Uint8Array(lh.buffer)); push(name); push(data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + data.length;
    });
    var cdStart = total;
    central.forEach(push);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, total - cdStart, true); end.setUint32(16, cdStart, true);
    push(new Uint8Array(end.buffer));
    var out = new Uint8Array(total), p = 0;
    chunks.forEach(function (c) { out.set(c, p); p += c.length; });
    return out;
  }

  function xe(s) {
    return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'short' }); }
    catch (e) { return iso || ''; }
  }
  function statusOf(u, ver) { return window.API.ackStatus(u, ver); }
  function wpKey(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }

  // hücre: { v, s } — s: 0 normal, 1 tablo başlığı, 2 büyük başlık, 3 not
  function sheetXml(rows, widths, headerRow, lastCol) {
    var data = rows.map(function (r, ri) {
      return '<row r="' + (ri + 1) + '">' + r.map(function (c, ci) {
        if (c == null || c === '') return '';
        var cell = typeof c === 'object' ? c : { v: c, s: 0 }, ref = colName(ci) + (ri + 1);
        return typeof cell.v === 'number'
          ? '<c r="' + ref + '" s="' + (cell.s || 0) + '"><v>' + cell.v + '</v></c>'
          : '<c r="' + ref + '" s="' + (cell.s || 0) + '" t="inlineStr"><is><t xml:space="preserve">' + xe(cell.v) + '</t></is></c>';
      }).join('') + '</row>';
    }).join('');
    var cols = '<cols>' + widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>';
    var view = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + headerRow + '" topLeftCell="A' + (headerRow + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    var filter = '<autoFilter ref="A' + headerRow + ':' + colName(lastCol) + Math.max(rows.length, headerRow + 1) + '"/>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      view + cols + '<sheetData>' + data + '</sheetData>' + filter + '</worksheet>';
  }

  function build(opt) {
    var users = opt.users || [], ver = opt.version, byId = {};
    users.forEach(function (u) { byId[u.id] = u; });
    function H(arr) { return arr.map(function (v) { return { v: v, s: 1 }; }); }

    var rows1 = [
      [{ v: COMPANY + ' — İSG Onay Kayıtları', s: 2 }],
      [{ v: 'Oluşturulma: ' + fmtDate(new Date().toISOString()) + '   ·   Kayıt sayısı: ' + users.length + '   ·   Güncel kural sürümü: ' + ver, s: 3 }],
      [],
      H(['Ad Soyad', 'Kullanıcı Adı', 'Rol', 'Çalışma Yeri', 'Durum', 'Son Onay Tarihi', 'Kural Sürümü'])
    ];
    users.forEach(function (u) {
      rows1.push([u.name, u.username, u.role === 'admin' ? 'Yönetici' : 'Çalışan', u.ack ? u.ack.workplace : '',
        STATUS_TR[statusOf(u, ver)], u.ack ? fmtDate(u.ack.at) : '', u.ack ? u.ack.version : '']);
    });

    var groups = {};
    users.forEach(function (u) {
      if (!u.ack) return;
      var k = wpKey(u.ack.workplace), g = groups[k] || (groups[k] = { label: u.ack.workplace, n: 0, ok: 0 });
      g.n++; if (statusOf(u, ver) === 'ok') g.ok++;
    });
    var rows2 = [[{ v: 'Çalışma Yerine Göre Özet', s: 2 }], [], [], H(['Çalışma Yeri', 'Onaylayan', 'Bugün Onaylayan'])];
    Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return b.n - a.n; })
      .forEach(function (x) { rows2.push([x.label, { v: x.n, s: 0 }, { v: x.ok, s: 0 }]); });

    var rows3 = [[{ v: 'Onay Geçmişi (her onay ayrı satırdır)', s: 2 }], [], [], H(['Ad Soyad', 'Kullanıcı Adı', 'Çalışma Yeri', 'Onay Tarihi', 'Kural Sürümü'])];
    (opt.history || []).forEach(function (h) {
      var u = byId[h.user_id]; if (!u) return;
      rows3.push([u.name, u.username, h.workplace, fmtDate(h.agreed_at), h.version]);
    });

    var sheets = [
      { name: 'Onay Kayıtları', xml: sheetXml(rows1, [26, 20, 12, 28, 14, 22, 16], 4, 6), end: 'G' + Math.max(rows1.length, 5) },
      { name: 'Özet', xml: sheetXml(rows2, [34, 14, 26], 4, 2), end: 'C' + Math.max(rows2.length, 5) },
      { name: 'Onay Geçmişi', xml: sheetXml(rows3, [26, 20, 28, 22, 16], 4, 4), end: 'E' + Math.max(rows3.length, 5) }
    ];
    var ns = 'http://schemas.openxmlformats.org/', R = ns + 'officeDocument/2006/relationships/';
    var head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    var files = [
      { name: '[Content_Types].xml', data: head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: '_rels/.rels', data: head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + R + 'officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: head + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="' + R.slice(0, -1) + '"><sheets>' +
        sheets.map(function (s, i) { return '<sheet name="' + xe(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets><definedNames>' +
        sheets.map(function (s, i) { return '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">\'' + xe(s.name) + '\'!$A$4:$' + s.end.replace(/(\d+)/, '$$$1') + '</definedName>'; }).join('') + '</definedNames></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="' + R + 'worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="' + R + 'styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: head + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FF2A2A8E"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF566772"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2A2A8E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' }
    ].concat(sheets.map(function (s, i) { return { name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: s.xml }; }));
    return makeZip(files);
  }

  function download(bytes, filename) {
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  window.XLSX = { build: build, download: download };
})();
