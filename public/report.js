(function () {
'use strict';
var sheet = document.getElementById('sheet');
var params = new URLSearchParams(location.search);

function h(tag, props) {
  var e = document.createElement(tag), p = props || {};
  Object.keys(p).forEach(function (k) { if (k === 'class') e.className = p[k]; else if (p[k] != null && p[k] !== false) e.setAttribute(k, p[k]); });
  for (var i = 2; i < arguments.length; i++) {
    var c = arguments[i]; if (c == null || c === false) continue;
    (Array.isArray(c) ? c : [c]).forEach(function (x) { e.append(x.nodeType ? x : document.createTextNode(x)); });
  }
  return e;
}
function norm(s) { return String(s || '').trim().replace(/\s+/g, ' '); }
function fmt(iso) { try { return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso || ''; } }
var LABEL = { ok: 'Bugün onayladı', old: 'Süresi doldu', none: 'Hiç onaylamadı' };

document.getElementById('print').addEventListener('click', function () { window.print(); });
document.getElementById('close').addEventListener('click', function () { window.close(); });

function fail(msg) { sheet.replaceChildren(h('p', { class: 'err' }, msg)); }

if (!window.API || !API.configured) {
  fail('Kurulum tamamlanmamış: config.js dosyasını doldurun.');
} else {
  Promise.all([
    API.me(),
    fetch('rules.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
  ]).then(function (r) {
    var me = r[0], ver = r[1].version;
    if (!me) throw new Error('Raporu görmek için önce uygulamaya yönetici olarak giriş yapın.');
    if (me.role !== 'admin') throw new Error('Bu rapor yalnızca yöneticiler içindir.');
    return API.listEmployees().then(function (all) { return { all: all, ver: ver }; });
  }).then(function (d) {
    var ver = d.ver;
    function st(u) { return API.ackStatus(u, ver); }
    var q = norm(params.get('q')).toLowerCase(), wp = params.get('wp') || '', fs = params.get('st') || '';
    var list = d.all.filter(function (u) {
      if (fs && st(u) !== fs) return false;
      if (wp && (!u.ack || norm(u.ack.workplace).toLowerCase() !== wp)) return false;
      return !q || (u.name + ' ' + u.username).toLowerCase().indexOf(q) > -1;
    }).sort(function (a, b) { return a.name.localeCompare(b.name, 'tr'); });

    var ok = list.filter(function (u) { return st(u) === 'ok'; }).length;
    var old = list.filter(function (u) { return st(u) === 'old'; }).length;
    var places = {};
    list.forEach(function (u) { if (u.ack) places[norm(u.ack.workplace).toLowerCase()] = 1; });

    var filterText = [];
    if (q) filterText.push('Arama: ' + params.get('q'));
    if (wp) { var f = list.filter(function (u) { return u.ack; })[0]; filterText.push('Çalışma yeri: ' + (f ? f.ack.workplace : wp)); }
    if (fs) filterText.push('Durum: ' + LABEL[fs]);

    var rows = list.map(function (u) {
      return h('tr', {},
        h('td', {}, u.name, h('small', {}, u.username + (u.role === 'admin' ? ' · Yönetici' : ''))),
        h('td', {}, u.ack ? u.ack.workplace : '—'),
        h('td', {}, h('span', { class: 'st ' + st(u) }, LABEL[st(u)])),
        h('td', {}, u.ack ? fmt(u.ack.at) : '—'),
        h('td', {}, u.ack ? 'v' + u.ack.version : '—'));
    });

    var parts = [
      h('div', { class: 'head' },
        h('img', { src: 'logo.png', alt: 'WOVATEK MÜHENDİSLİK' }),
        h('div', {}, h('h1', {}, 'İSG Onay Kayıtları Raporu'),
          h('div', { class: 'meta' }, 'Oluşturulma: ' + fmt(new Date().toISOString()) + ' · Güncel kural sürümü: v' + ver))),
      h('div', { class: 'yel' }, h('i'), h('i')),
      h('div', { class: 'summary' },
        h('div', {}, h('b', {}, String(list.length)), h('span', {}, 'Kayıt')),
        h('div', {}, h('b', {}, String(ok)), h('span', {}, 'Bugün onaylayan')),
        h('div', {}, h('b', {}, String(list.length - ok)), h('span', {}, 'Bugün onaylamayan' + (old ? ' (' + old + ' kişinin onayı eski)' : ''))),
        h('div', {}, h('b', {}, String(Object.keys(places).length)), h('span', {}, 'Çalışma yeri'))),
      filterText.length ? h('p', { class: 'filters' }, 'Süzgeç — ' + filterText.join(' · ')) : null,
      h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Çalışan'), h('th', {}, 'Çalışma Yeri'), h('th', {}, 'Durum'), h('th', {}, 'Onay Tarihi'), h('th', {}, 'Kural Sürümü'))),
        h('tbody', {}, rows.length ? rows : h('tr', {}, h('td', { colspan: '5' }, 'Kayıt bulunamadı.')))),
      h('div', { class: 'foot' }, h('span', {}, 'WOVATEK MÜHENDİSLİK · İş Sağlığı ve Güvenliği Onay Kaydı'), h('span', {}, 'Bu rapor sistem tarafından otomatik oluşturulmuştur.'))
    ].filter(Boolean);
    sheet.replaceChildren.apply(sheet, parts);

    if (params.get('auto') === '1') {
      var go = function () { setTimeout(function () { window.print(); }, 300); };
      var img = sheet.querySelector('img');
      if (img && !img.complete) img.addEventListener('load', go); else go();
    }
  }).catch(function (e) { fail(e.message || 'Rapor alınamadı.'); });
}
})();
