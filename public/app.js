(function () {
'use strict';

var app = document.getElementById('app');
var S = { user: null, rules: null, tab: 'dash', emps: [], version: '', filt: { q: '', wp: '', st: '' } };

/* ---------- Yardımcılar ---------- */
function h(tag, props) {
  var e = document.createElement(tag), p = props || {};
  Object.keys(p).forEach(function (k) {
    var v = p[k];
    if (k === 'class') e.className = v;
    else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  });
  for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
  return e;
}
function add(e, c) {
  if (c == null || c === false) return;
  if (Array.isArray(c)) c.forEach(function (x) { add(e, x); });
  else e.append(c.nodeType ? c : document.createTextNode(c));
}
function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); return e; }
function norm(s) { return String(s || '').trim().replace(/\s+/g, ' '); }
function fmt(iso) {
  try { return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch (e) { return iso || ''; }
}
var toastT;
function toast(t) {
  var el = document.getElementById('toast');
  el.textContent = t; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('show'); }, 2800);
}
function genPassword() {
  var A = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', out = '';
  var a = new Uint32Array(10); crypto.getRandomValues(a);
  for (var i = 0; i < a.length; i++) out += A[a[i] % A.length];
  return out;
}
function status(u) { return API.ackStatus(u, S.version); }
var STATUS_LABEL = { ok: 'Bugün onayladı', old: 'Süresi doldu', none: 'Hiç onaylamadı' };
function pill(st) { return h('span', { class: 'pill ' + st }, STATUS_LABEL[st]); }
function errBox(msg) { return h('div', { class: 'err', role: 'alert' }, msg); }
function field(id, label, input, hint) {
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('span', { class: 'hint' }, hint) : null);
}
function logo(cls) {
  return h('div', { class: 'logo-badge' + (cls ? ' ' + cls : '') }, h('img', { src: 'logo.png', alt: 'WOVATEK MÜHENDİSLİK' }));
}
function messageCard(title, sub, extra) {
  clear(app);
  app.append(h('div', { class: 'card auth' }, h('div', { class: 'auth-logo' }, logo()), h('h2', {}, title), h('p', { class: 'sub' }, sub), extra));
}

/* ---------- Giriş ve başlangıç ---------- */
function showConfigNeeded() {
  messageCard('Kurulum tamamlanmamış', 'public/config.js dosyasındaki Supabase adresini, anahtarını ve giriş alan adını kendi bilgilerinizle doldurun. Adımlar README.md dosyasındadır.');
}
function showFatal(msg) {
  messageCard('Uygulama başlatılamadı', msg, h('button', { class: 'btn', type: 'button', onclick: function () { location.reload(); } }, 'Yeniden dene'));
}
function showProfileMissing() {
  messageCard('Profil bulunamadı',
    'Hesabınız var ancak profil kaydı oluşmamış. supabase/schema.sql dosyası, hesaplar oluşturulmadan önce çalıştırılmalıdır. Yöneticiye başvurun.',
    h('button', { class: 'btn ghost', type: 'button', onclick: logout }, 'Çıkış'));
}
function showLogin(msg) {
  var user = h('input', { type: 'text', id: 'l-user', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false' });
  var pw = h('input', { type: 'password', id: 'l-pw', autocomplete: 'current-password' });
  var err = h('div'); if (msg) err.append(errBox(msg));
  var btn = h('button', { class: 'btn', type: 'submit' }, 'Giriş');
  var form = h('form', {
    onsubmit: function (e) {
      e.preventDefault(); clear(err); btn.disabled = true;
      API.login(user.value, pw.value).then(loadUser)
        .catch(function (x) { err.append(errBox(x.message)); })
        .then(function () { btn.disabled = false; });
    }
  }, field('l-user', 'Kullanıcı adı', user), field('l-pw', 'Şifre', pw), btn, err);
  messageCard('İSG Onay Kaydı', 'Yöneticinizin verdiği kullanıcı adı ve şifre ile giriş yapın.', form);
  user.focus();
}
function loadUser() {
  return API.me().then(function (u) {
    if (!u) return showProfileMissing();
    S.user = u;
    return fetch('rules.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('Kurallar dosyası okunamadı.');
      return r.json();
    }).then(function (r) {
      S.rules = r; S.version = r.version;
      S.tab = u.role === 'admin' ? 'dash' : 'me';
      shell();
    });
  });
}
function logout() {
  API.logout().then(function () { S.user = null; showLogin(); });
}

/* ---------- Genel çerçeve ---------- */
function shell() {
  clear(app);
  var isAdmin = S.user.role === 'admin';
  var content = h('main', { id: 'content' });
  app.append(
    h('header', { class: 'top' },
      h('div', { class: 'brand' }, logo(),
        h('div', {}, h('h1', {}, 'İSG Onay Kaydı'), h('p', {}, 'İş sağlığı ve güvenliği kurallarını okuyup onaylayın'))),
      h('div', { class: 'who' }, h('span', {}, h('b', {}, S.user.name)),
        h('button', { class: 'btn ghost sm', type: 'button', onclick: logout }, 'Çıkış'))));
  if (isAdmin) {
    var tabs = h('div', { class: 'tabs', role: 'tablist' });
    [['dash', 'Takip Paneli'], ['add', 'Çalışan Ekle'], ['me', 'Onayım']].filter(function (t) { return t[0] !== 'add' || S.user.isOwner; }).forEach(function (t) {
      tabs.append(h('button', {
        role: 'tab', 'aria-selected': String(S.tab === t[0]),
        onclick: function () { S.tab = t[0]; shell(); }
      }, t[1]));
    });
    app.append(tabs);
  } else S.tab = 'me';
  app.append(content);
  if (S.tab === 'dash') renderDash(content);
  else if (S.tab === 'add' && S.user.isOwner) renderAdd(content);
  else renderMine(content);
}

/* ---------- Çalışanın onayı ---------- */
function renderMine(root) {
  var u = S.user, rules = S.rules;
  var statusEl = h('div', { class: 'status' });
  var wp = h('input', { type: 'text', id: 'f-wp', maxlength: '80', autocomplete: 'organization', placeholder: 'Örn: Gebze GES Sahası, Depo 3, Ankara Şubesi' });
  if (u.ack) wp.value = u.ack.workplace;
  var meter = h('i');
  var box = h('div', { class: 'rules', tabindex: '0', role: 'region', 'aria-label': 'İş sağlığı ve güvenliği kuralları' });
  rules.sections.forEach(function (s) {
    if (s.group) box.append(h('h2', { class: 'grp' }, s.group));
    box.append(h('section', {}, h('h3', {}, s.title), h('ul', {}, s.items.map(function (x) { return h('li', {}, x); }))));
  });
  box.append(h('p', { class: 'note' }, rules.note));
  var chk = h('input', { type: 'checkbox', id: 'f-agree', disabled: true });
  var agree = h('div', { class: 'agree locked' }, chk,
    h('label', { for: 'f-agree' }, rules.agreeText || 'Yukarıdaki kuralları okudum, anladım ve uymayı kabul ediyorum.'));
  var hint = h('p', { class: 'hint-line' }, 'Onay kutusunu etkinleştirmek için kuralların sonuna kadar kaydırın.');
  var errEl = h('div');
  var btn = h('button', { class: 'btn xl', type: 'button', disabled: true });
  var read = false;

  function paint() {
    var cur = API.ackStatus(u, S.version) === 'ok';
    statusEl.className = 'status' + (u.ack ? (cur ? ' ok' : ' old') : '');
    clear(statusEl);
    statusEl.append(h('span', { class: 'dot' }), h('div', {},
      h('strong', {}, u.ack ? (cur ? 'Bugünkü onayınız tamamlandı' : 'Bugünkü onayınız bekleniyor, her gün yenilenmelidir') : 'Henüz onay vermediniz'),
      h('span', {}, u.ack ? 'Çalışma yeri: ' + u.ack.workplace + ' · Son onay: ' + fmt(u.ack.at) : 'Çalışma yerinizi yazın, kuralları okuyun ve onaylayın. Onay her gün yenilenir.')));
    btn.textContent = u.ack ? 'Bugünkü onayı ver' : 'Onaylıyorum ve kaydet';
  }
  function sync() { btn.disabled = !(read && chk.checked && norm(wp.value).length >= 2); }
  function check() {
    var max = box.scrollHeight - box.clientHeight;
    meter.style.width = (max <= 8 ? 100 : Math.min(100, Math.round(box.scrollTop / max * 100))) + '%';
    if (!read && (max <= 8 || box.scrollTop >= max - 8)) {
      read = true; chk.disabled = false; agree.classList.remove('locked');
      hint.textContent = 'Teşekkürler. Artık onayınızı verebilirsiniz.';
    }
    sync();
  }
  box.addEventListener('scroll', check);
  wp.addEventListener('input', sync);
  chk.addEventListener('change', sync);
  btn.addEventListener('click', function () {
    clear(errEl); btn.disabled = true;
    API.acknowledge(norm(wp.value), S.version)
      .then(function () { return API.me(); })
      .then(function (me) { if (me) { S.user = u = me; } chk.checked = false; paint(); toast('Onayınız kaydedildi'); })
      .catch(function (x) { errEl.append(errBox(x.message)); })
      .then(sync);
  });

  var pwCur = h('input', { type: 'password', id: 'p-cur', autocomplete: 'current-password' });
  var pwNew = h('input', { type: 'password', id: 'p-new', autocomplete: 'new-password' });
  var pwErr = h('div');
  var pwBtn = h('button', { class: 'btn ghost', type: 'button', onclick: function () {
    clear(pwErr);
    API.changePassword(u.username, pwCur.value, pwNew.value)
      .then(function () { pwCur.value = ''; pwNew.value = ''; toast('Şifre değiştirildi'); })
      .catch(function (x) { pwErr.append(errBox(x.message)); });
  } }, 'Şifreyi değiştir');

  root.append(h('div', { class: 'wrap' }, statusEl,
    h('div', { class: 'card' }, h('h2', {}, 'Çalışma Yeri'), h('p', { class: 'sub' }, 'Yönetici panelinde görünür.'),
      field('f-wp', 'Çalışma yeri adı', wp, 'Çalıştığınız tesis veya birimin adını yazın.')),
    h('div', { class: 'card' },
      h('div', { class: 'rules-head' }, h('b', {}, 'İSG Kuralları ve Talimatlar'), h('span', { class: 'ver' }, 'v' + rules.version)),
      h('div', { class: 'meter' }, meter), box, hint, agree, btn, errEl),
    h('div', { class: 'card' }, h('details', { class: 'pw' }, h('summary', {}, 'Şifreyi değiştir'),
      h('div', { class: 'row' }, field('p-cur', 'Mevcut şifre', pwCur), field('p-new', 'Yeni şifre', pwNew)),
      h('div', { class: 'hint-line' }, 'En az 8 karakter.'), pwBtn, pwErr))));
  paint();
  requestAnimationFrame(check);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(check);
}

/* ---------- Takip paneli ---------- */
function renderDash(root) {
  var stats = h('div', { class: 'stats' });
  var bars = h('div', { class: 'bars' });
  var q = h('input', { type: 'text', id: 'd-q', placeholder: 'Ad veya kullanıcı adı ara', 'aria-label': 'Ara', autocomplete: 'off' });
  var wpSel = h('select', { id: 'd-wp', 'aria-label': 'Çalışma yerine göre süz' });
  var stSel = h('select', { id: 'd-st', 'aria-label': 'Duruma göre süz' },
    h('option', { value: '' }, 'Tüm durumlar'), h('option', { value: 'ok' }, 'Bugün onayladı'), h('option', { value: 'old' }, 'Süresi doldu (bugün onaylamadı)'), h('option', { value: 'none' }, 'Hiç onaylamadı'));
  var tbody = h('tbody');
  var empty = h('div', { class: 'empty' });
  var result = h('div');
  var xlsxBtn = h('button', { class: 'btn ghost sm', type: 'button', onclick: exportXlsx }, 'Excel (.xlsx)');
  var pdfBtn = h('button', { class: 'btn ghost sm', type: 'button', onclick: function () { window.open('report.html?auto=1&' + qs(), '_blank'); } }, 'PDF');
  q.value = S.filt.q; stSel.value = S.filt.st;

  function qs() {
    return 'q=' + encodeURIComponent(norm(S.filt.q)) + '&wp=' + encodeURIComponent(S.filt.wp) + '&st=' + encodeURIComponent(S.filt.st);
  }
  function exportXlsx() {
    xlsxBtn.disabled = true;
    API.history().then(function (hist) {
      XLSX.download(XLSX.build({ users: visible(), history: hist, version: S.version }), 'isg-onay-kayitlari.xlsx');
      toast('Excel dosyası hazırlandı');
    }).catch(function (x) { toast(x.message); }).then(function () { xlsxBtn.disabled = false; });
  }
  function groups() {
    var m = {};
    S.emps.forEach(function (u) {
      if (!u.ack) return;
      var k = norm(u.ack.workplace).toLowerCase();
      if (!m[k]) m[k] = { key: k, label: norm(u.ack.workplace), n: 0 };
      if (status(u) === 'ok') m[k].n++;
    });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.n - a.n; });
  }
  function visible() {
    var s = norm(S.filt.q).toLowerCase();
    return S.emps.filter(function (u) {
      if (S.filt.st && status(u) !== S.filt.st) return false;
      if (S.filt.wp && (!u.ack || norm(u.ack.workplace).toLowerCase() !== S.filt.wp)) return false;
      return !s || (u.name + ' ' + u.username).toLowerCase().indexOf(s) > -1;
    }).sort(function (a, b) { return a.name.localeCompare(b.name, 'tr'); });
  }
  function drawStats() {
    var total = S.emps.length;
    var ok = S.emps.filter(function (u) { return status(u) === 'ok'; }).length;
    var old = S.emps.filter(function (u) { return status(u) === 'old'; }).length;
    function st(c, v, l) { return h('div', { class: 'stat ' + c }, h('b', {}, String(v)), h('span', {}, l)); }
    clear(stats).append(
      st('c1', total, 'Toplam hesap'),
      st('c2', ok, 'Bugün onaylayan'),
      st('c3', total - ok, 'Bugün onaylamayan' + (old ? ' (' + old + ' kişinin onayı eski)' : '')),
      st('c4', groups().length, 'Çalışma yeri'));
  }
  function drawBars() {
    var g = groups(), max = g.reduce(function (a, x) { return Math.max(a, x.n); }, 1);
    clear(bars);
    if (!g.length) bars.append(h('div', { class: 'empty' }, 'Henüz kayıtlı onay yok.'));
    g.forEach(function (x) {
      var bar = h('button', { class: 'bar', type: 'button', 'aria-pressed': String(S.filt.wp === x.key), onclick: function () {
        S.filt.wp = S.filt.wp === x.key ? '' : x.key; wpSel.value = S.filt.wp; drawBars(); drawTable();
      } }, h('span', { class: 'nm' }, x.label), h('span', { class: 'track' }, h('i')), h('span', { class: 'n' }, String(x.n)));
      bar.querySelector('i').style.width = Math.round(x.n / max * 100) + '%';
      bars.append(bar);
    });
    var cur = S.filt.wp;
    clear(wpSel).append(h('option', { value: '' }, 'Tüm çalışma yerleri'));
    g.forEach(function (x) { wpSel.append(h('option', { value: x.key }, x.label)); });
    wpSel.value = cur;
  }
  function drawTable() {
    var v = visible(); clear(tbody);
    v.forEach(function (u) {
      var del = h('button', { class: 'btn danger sm', type: 'button' }, 'Sil');
      var armed = false, t;
      function disarm() { armed = false; del.textContent = 'Sil'; del.classList.remove('armed'); }
      del.addEventListener('click', function () {
        if (!armed) {
          armed = true; del.textContent = 'Silmeyi onayla'; del.classList.add('armed');
          t = setTimeout(disarm, 4000); return;
        }
        clearTimeout(t); del.disabled = true;
        API.admin('delete', { id: u.id }).then(function () { toast('Hesap silindi'); load(); })
          .catch(function (x) { toast(x.message); disarm(); del.disabled = false; });
      });
      var reset = h('button', { class: 'btn ghost sm', type: 'button', onclick: function () {
        API.admin('reset', { id: u.id }).then(function (d) {
          clear(result).append(credsBox([{ name: u.name, username: d.username, password: d.password }], 'Yeni şifre'));
          result.scrollIntoView({ block: 'nearest' });
        }).catch(function (x) { toast(x.message); });
      } }, 'Yeni şifre');
      tbody.append(h('tr', {},
        h('td', {}, u.name, u.role === 'admin' ? h('span', { class: 'pill adm' }, 'Yönetici') : null, h('small', {}, u.username)),
        h('td', {}, u.ack ? u.ack.workplace : '—'),
        h('td', {}, pill(status(u))),
        h('td', { class: 'mono' }, u.ack ? fmt(u.ack.at) : '—'),
        h('td', { class: 'acts' }, S.user.isOwner ? [reset, del] : null)));
    });
    empty.hidden = v.length > 0;
    empty.textContent = S.emps.length > 1 ? 'Eşleşen sonuç yok.' : (S.user.isOwner ? 'Henüz çalışan yok. «Çalışan Ekle» sekmesinden ekleyin.' : 'Henüz çalışan yok.');
  }
  function draw() { drawStats(); drawBars(); drawTable(); }
  function load() {
    return API.listEmployees().then(function (list) { S.emps = list; draw(); })
      .catch(function (x) { clear(empty).append(x.message); empty.hidden = false; });
  }
  q.addEventListener('input', function () { S.filt.q = q.value; drawTable(); });
  wpSel.addEventListener('change', function () { S.filt.wp = wpSel.value; drawBars(); drawTable(); });
  stSel.addEventListener('change', function () { S.filt.st = stSel.value; drawTable(); });

  root.append(h('div', { class: 'wrap' }, stats,
    h('div', { class: 'card' }, h('h2', {}, 'Çalışma Yerine Göre Bugün Onaylayanlar'), h('p', { class: 'sub' }, 'Tabloyu filtrelemek için bir çalışma yerine tıklayın.'), bars),
    h('div', { class: 'card' }, h('h2', {}, 'Çalışanlar ve Onaylar'),
      h('p', { class: 'sub' }, 'Dışa aktarma, aşağıdaki arama ve süzgeçlere göre yapılır.'),
      h('div', { class: 'tools' }, q, wpSel, stSel, xlsxBtn, pdfBtn),
      h('div', { class: 'tablebox' }, h('table', {}, h('thead', {}, h('tr', {},
        h('th', {}, 'Çalışan'), h('th', {}, 'Çalışma Yeri'), h('th', {}, 'Durum'), h('th', {}, 'Onay Tarihi'), h('th', {}, S.user.isOwner ? 'İşlemler' : ''))), tbody)),
      empty, result)));
  load();
}

/* ---------- Yeni giriş bilgileri (bir kez gösterilir) ---------- */
function credsBox(list, title) {
  var tb = h('tbody');
  list.forEach(function (c) { tb.append(h('tr', {}, h('td', {}, c.name), h('td', { class: 'mono' }, c.username), h('td', { class: 'mono' }, c.password))); });
  function asText() { return list.map(function (c) { return c.name + '\t' + c.username + '\t' + c.password; }).join('\n'); }
  function asCsv() {
    function q(s) { s = String(s); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
    return '﻿' + ['Ad Soyad,Kullanıcı Adı,Şifre'].concat(list.map(function (c) { return [c.name, c.username, c.password].map(q).join(','); })).join('\r\n');
  }
  return h('div', { class: 'creds' },
    h('h3', {}, title || 'Giriş bilgileri'),
    h('p', {}, 'Şifreler burada yalnızca bir kez gösterilir ve okunabilir biçimde saklanmaz. Şimdi kopyalayın veya indirin ve her çalışana teslim edin.'),
    h('div', { class: 'tablebox' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Ad Soyad'), h('th', {}, 'Kullanıcı adı'), h('th', {}, 'Şifre'))), tb)),
    h('div', { class: 'acts' },
      h('button', { class: 'btn ghost sm', type: 'button', onclick: function () {
        (navigator.clipboard ? navigator.clipboard.writeText(asText()) : Promise.reject()).then(function () { toast('Kopyalandı'); }, function () { toast('Kopyalanamadı, indirmeyi kullanın'); });
      } }, 'Kopyala'),
      h('button', { class: 'btn ghost sm', type: 'button', onclick: function () {
        var a = h('a', { href: URL.createObjectURL(new Blob([asCsv()], { type: 'text/csv;charset=utf-8' })), download: 'giris-bilgileri.csv' });
        document.body.append(a); a.click(); a.remove();
      } }, 'CSV indir')));
}

/* ---------- Çalışan ekleme ---------- */
function renderAdd(root) {
  var name = h('input', { type: 'text', id: 'a-name', maxlength: '80', autocomplete: 'off' });
  var user = h('input', { type: 'text', id: 'a-user', maxlength: '32', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
  var pw = h('input', { type: 'text', id: 'a-pw', maxlength: '128', autocomplete: 'off' });
  pw.value = genPassword();
  var isAdm = h('input', { type: 'checkbox', id: 'a-adm' });
  var err1 = h('div'), res1 = h('div');
  var gen = h('button', { class: 'btn ghost sm', type: 'button', onclick: function () { pw.value = genPassword(); } }, 'Üret');
  var addBtn = h('button', { class: 'btn', type: 'submit' }, 'Çalışanı ekle');
  var single = h('form', {
    onsubmit: function (e) {
      e.preventDefault(); clear(err1); clear(res1); addBtn.disabled = true;
      var body = { name: name.value, email: API.emailFor(user.value), password: pw.value, role: isAdm.checked ? 'admin' : 'employee' };
      API.admin('create', body).then(function (d) {
        res1.append(credsBox([{ name: d.user.name, username: d.user.username, password: body.password }], 'Hesap eklendi'));
        name.value = ''; user.value = ''; pw.value = genPassword(); isAdm.checked = false;
      }).catch(function (x) { err1.append(errBox(x.message)); }).then(function () { addBtn.disabled = false; });
    }
  }, field('a-name', 'Çalışan adı', name),
    field('a-user', 'Kullanıcı adı', user, 'Küçük harf ve rakam, örn: ahmet.y'),
    h('div', { class: 'field' }, h('label', { for: 'a-pw' }, 'Şifre'), h('div', { class: 'row' }, pw, gen),
      h('span', { class: 'hint' }, 'En az 8 karakter. Ekledikten sonra çalışana teslim edin.')),
    h('div', { class: 'agree' }, isAdm, h('label', { for: 'a-adm' }, 'Yönetici hesabı (paneli görür ve çalışan ekler)')),
    addBtn, err1, res1);

  var bulk = h('textarea', { id: 'b-text', placeholder: 'Ahmet Yılmaz, ahmet.y\nAyşe Demir, ayse.d\nMehmet Kaya, m.kaya', spellcheck: 'false' });
  var err2 = h('div'), res2 = h('div');
  var bulkBtn = h('button', { class: 'btn', type: 'button', onclick: function () {
    clear(err2); clear(res2);
    var rows = bulk.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var i = l.lastIndexOf(','); if (i < 0) i = l.lastIndexOf('\t');
      var n = i < 0 ? l : l.slice(0, i).trim(), u = i < 0 ? '' : l.slice(i + 1).trim();
      return { name: n, email: API.emailFor(u) };
    });
    if (!rows.length) { err2.append(errBox('En az bir çalışan yazın; her çalışan ayrı satırda olmalı.')); return; }
    bulkBtn.disabled = true;
    API.admin('bulk', { employees: rows }).then(function (d) {
      if (d.created.length) { res2.append(credsBox(d.created, d.created.length + ' hesap eklendi')); bulk.value = ''; }
      if (d.skipped.length) {
        res2.append(errBox(d.skipped.length + ' satır eklenmedi: ' + d.skipped.map(function (s) { return 'Satır ' + s.row + ' (' + s.reason + ')'; }).join(', ')));
      }
    }).catch(function (x) { err2.append(errBox(x.message)); }).then(function () { bulkBtn.disabled = false; });
  } }, 'Hepsini ekle');

  root.append(h('div', { class: 'two' },
    h('div', { class: 'card' }, h('h2', {}, 'Çalışan Ekle'), h('p', { class: 'sub' }, 'Tek bir çalışan için giriş hesabı oluşturun.'), single),
    h('div', { class: 'card' }, h('h2', {}, 'Toplu Çalışan Ekle'), h('p', { class: 'sub' }, 'Her çalışan için bir satır: Ad Soyad, kullanıcı adı. Şifreler otomatik üretilir.'),
      h('div', { class: 'field' }, h('label', { for: 'b-text' }, 'Çalışan listesi'), bulk), bulkBtn, err2, res2)));
}

/* ---------- Başlangıç ---------- */
if (!API.configured) showConfigNeeded();
else {
  window.sbReady
    .then(function () { return API.getSession(); })
    .then(function (sess) { return sess ? loadUser() : showLogin(); })
    .catch(function (e) { showFatal(e && e.message ? e.message : 'Bilinmeyen hata'); });
}

})();
