// تشغيل:  node --experimental-strip-types --no-warnings test/test-function.mjs
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
let src = fs.readFileSync('supabase/functions/admin-users/index.ts', 'utf8');
src = src.replace(/^import .*createClient.*$/m, 'const createClient = () => globalThis.__client;');
const pre = 'const Deno = { env: { get: (k) => ({SUPABASE_URL:"http://x",SUPABASE_SERVICE_ROLE_KEY:"srv"})[k] }, serve: (h) => { globalThis.__handler = h; } };\n';
const tmp = path.join(os.tmpdir(), 'fn-under-test.ts'); fs.writeFileSync(tmp, pre + src);

// ---- sahte Supabase istemcisi (bellekte) ----
const db = { users: new Map(), profiles: new Map() }; let n = 0;
const tokens = {};
function addUser(email, role, name) { const id = 'id' + (++n); db.users.set(id, { id, email }); db.profiles.set(id, { id, username: email.split('@')[0], name: name || email.split('@')[0], role }); return id; }
function builder(table) {
  const st = { op: 'select', filters: [], opts: {}, patch: null };
  const run = () => {
    let rows = [...db.profiles.values()].filter(r => st.filters.every(([c, v]) => r[c] === v));
    if (st.op === 'update') { rows.forEach(r => Object.assign(r, st.patch)); return { data: null, error: null }; }
    if (st.opts.head) return { count: rows.length, error: null };
    return { data: rows, error: null };
  };
  const b = {
    select(cols, opts) { st.opts = opts || {}; return b; }, update(p) { st.op = 'update'; st.patch = p; return b; },
    eq(c, v) { st.filters.push([c, v]); return b; },
    maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
    then(res, rej) { return Promise.resolve(run()).then(res, rej); }
  };
  return b;
}
globalThis.__client = {
  auth: {
    getUser: async (t) => tokens[t] ? { data: { user: { id: tokens[t] } }, error: null } : { data: null, error: { message: 'bad' } },
    admin: {
      createUser: async ({ email, password, user_metadata }) => {
        if ([...db.users.values()].some(u => u.email === email)) return { data: null, error: { code: 'email_exists', message: 'A user with this email address has already been registered' } };
        if (email.endsWith('@bad.invalid')) return { data: null, error: { message: 'Email address is invalid' } };
        const id = addUser(email, [...db.profiles.values()].length ? 'employee' : 'admin', user_metadata?.name); db.users.get(id).password = password; return { data: { user: { id } }, error: null };
      },
      updateUserById: async (id, { password }) => { db.users.get(id).password = password; return { error: null }; },
      deleteUser: async (id) => { db.users.delete(id); db.profiles.delete(id); return { error: null }; }
    }
  }, from: builder
};
await import('file://' + tmp);
const H = globalThis.__handler;
async function call(token, body, method = 'POST') {
  const r = await H(new Request('http://x/fn', { method, headers: { Authorization: token ? 'Bearer ' + token : '', 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined }));
  return { s: r.status, j: await r.json().catch(() => null) };
}
let pass = 0, fail = 0; const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ✔', name); } else { fail++; console.log('  ✘', name, extra ?? ''); } };

const adminId = addUser('admin@sirket.com', 'admin'); tokens.TA = adminId;
const empId = addUser('ahmet.y@sirket.com', 'employee'); tokens.TE = empId;

console.log('[yetki]');
ok('token yok → 401', (await call('', { action: 'create' })).s === 401);
ok('geçersiz token → 401', (await call('zzz', { action: 'create' })).s === 401);
ok('çalışan → 403', (await call('TE', { action: 'create' })).s === 403);
ok('GET → 405', (await call('TA', null, 'GET')).s === 405);
ok('CORS OPTIONS', (await H(new Request('http://x', { method: 'OPTIONS' }))).status === 200);
ok('bilinmeyen işlem → 400', (await call('TA', { action: 'x' })).s === 400);

console.log('[create]');
let r = await call('TA', { action: 'create', name: 'Ayşe Demir', email: 'ayse.d@sirket.com', password: 'Gizli12345' });
ok('oluşturuldu 201', r.s === 201 && r.j.user.username === 'ayse.d', JSON.stringify(r));
ok('yeni hesap çalışan rolünde', [...db.profiles.values()].find(p => p.username === 'ayse.d')?.role === 'employee');
ok('ad metadata ile gitti', [...db.profiles.values()].find(p => p.username === 'ayse.d')?.name === 'Ayşe Demir');
r = await call('TA', { action: 'create', name: 'Ayşe Demir', email: 'ayse.d@sirket.com', password: 'Gizli12345' });
ok('aynı kullanıcı → 409', r.s === 409, JSON.stringify(r));
ok('kısa şifre → 400', (await call('TA', { action: 'create', name: 'Mehmet K', email: 'm.kaya@sirket.com', password: '123' })).s === 400);
ok('geçersiz kullanıcı adı → 400', (await call('TA', { action: 'create', name: 'Mehmet K', email: 'M K!@sirket.com', password: '12345678' })).s === 400);
ok('geçersiz alan adı → 400 (anlaşılır mesaj)', (await call('TA', { action: 'create', name: 'Mehmet K', email: 'mk.kaya@bad.invalid', password: '12345678' })).j?.error?.includes('loginDomain'));
r = await call('TA', { action: 'create', name: 'Yeni Yönetici', email: 'yonetici2@sirket.com', password: '12345678', role: 'admin' });
ok('admin rolüyle oluşturma', r.s === 201 && [...db.profiles.values()].find(p => p.username === 'yonetici2')?.role === 'admin');

console.log('[bulk]');
r = await call('TA', { action: 'bulk', employees: [{ name: 'Zeynep Çelik', email: 'zeynep.c@sirket.com' }, { name: 'x', email: 'bad' }, { name: 'Ayşe Demir', email: 'ayse.d@sirket.com' }] });
ok('1 oluştu, 2 atlandı', r.j.created.length === 1 && r.j.skipped.length === 2, JSON.stringify(r.j));
ok('şifre üretildi (10, karışık harf)', /^[A-Za-z2-9]{10}$/.test(r.j.created[0].password));
ok('üretilen şifre kullanıcıya atandı', [...db.users.values()].find(u => u.email === 'zeynep.c@sirket.com').password === r.j.created[0].password);

console.log('[reset / delete]');
r = await call('TA', { action: 'reset', id: empId });
ok('şifre sıfırlandı', r.s === 200 && r.j.username === 'ahmet.y' && db.users.get(empId).password === r.j.password);
ok('olmayan çalışan → 404', (await call('TA', { action: 'reset', id: 'nope' })).s === 404);
ok('kendini silemez', (await call('TA', { action: 'delete', id: adminId })).s === 400);
ok('çalışanı siler', (await call('TA', { action: 'delete', id: empId })).s === 200 && !db.profiles.has(empId));
const y2 = [...db.profiles.values()].find(p => p.username === 'yonetici2').id;
ok('ikinci yönetici silinebilir (2 yönetici var)', (await call('TA', { action: 'delete', id: y2 })).s === 200);
// tek yönetici kaldı: ikinci bir yönetici token'ı ile silmeyi dene
const y3 = addUser('y3@sirket.com', 'admin'); tokens.T3 = y3;
ok('y3 ile admin silinir (2 yönetici)', (await call('T3', { action: 'delete', id: adminId })).s === 200);
const lastAdmins = [...db.profiles.values()].filter(p => p.role === 'admin').length;
ok('tek yönetici kaldı', lastAdmins === 1);
const y4 = addUser('y4@sirket.com', 'employee'); db.profiles.get(y4).role = 'admin'; tokens.T4 = y4;
await call('T4', { action: 'delete', id: y3 });
ok('son yönetici silinemez / kendini silemez', (await call('T4', { action: 'delete', id: y4 })).s === 400);
console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`); process.exit(fail ? 1 : 0);
