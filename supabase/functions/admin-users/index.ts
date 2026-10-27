// Supabase Edge Function: admin-users
// Yönetici panelinden çalışan hesabı oluşturma / toplu ekleme / şifre sıfırlama / silme.
// Bu işlemler "service role" anahtarı gerektirir; anahtar yalnızca burada (sunucuda) bulunur,
// tarayıcıya hiç gönderilmez. Her istekte çağıranın yönetici olduğu doğrulanır.
//
// Supabase panelinde: Edge Functions > Deploy a new function > Via Editor
//   Fonksiyon adı: admin-users   (bu dosyanın tamamını yapıştırın)
//   "Verify JWT" seçeneğini KAPATIN (doğrulamayı aşağıdaki kod kendisi yapar).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });

const USER_RE = /^[a-z0-9._-]{3,32}$/;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function genPassword(n = 10): string {
  const a = new Uint32Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => ALPHABET[x % ALPHABET.length]).join("");
}
function clean(s: unknown, max: number): string {
  return String(s ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}
function parseEmail(v: unknown): { email: string; username: string } | null {
  const email = String(v ?? "").trim().toLowerCase();
  const m = email.match(/^([^@\s]+)@([^@\s]+\.[^@\s]+)$/);
  if (!m || !USER_RE.test(m[1])) return null;
  return { email, username: m[1] };
}
function isDuplicate(err: any): boolean {
  const msg = String(err?.message ?? "").toLowerCase();
  return err?.code === "email_exists" || err?.code === "user_already_exists" ||
    msg.includes("already been registered") || msg.includes("already registered") || msg.includes("already exists");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Yöntem desteklenmiyor" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // 1) Çağıran kim? Yönetici mi?
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Oturum gerekli" }, 401);
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !who?.user) return json({ error: "Oturum geçersiz, yeniden giriş yapın" }, 401);
  const { data: me } = await admin.from("profiles").select("id, role").eq("id", who.user.id).maybeSingle();
  if (!me || me.role !== "admin") return json({ error: "Bu işlem yalnızca yöneticiler içindir" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Geçersiz istek" }, 400); }

  // Tek hesap oluşturur; { id } veya { error } döner
  async function createOne(name: string, email: string, password: string, role: string) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error || !data?.user) {
      return { error: isDuplicate(error) ? "kullanıcı adı kullanılıyor" : "hesap oluşturulamadı" };
    }
    if (role === "admin") {
      await admin.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
    }
    return { id: data.user.id };
  }

  switch (body?.action) {
    case "create": {
      const name = clean(body.name, 80);
      const pe = parseEmail(body.email);
      const password = String(body.password ?? "");
      if (name.length < 2) return json({ error: "Çalışanın adını yazın" }, 400);
      if (!pe) return json({ error: "Kullanıcı adı 3-32 karakter olmalı; küçük harf (a-z), rakam ve . _ - kullanın" }, 400);
      if (password.length < 8 || password.length > 128) return json({ error: "Şifre en az 8 karakter olmalı" }, 400);
      const r = await createOne(name, pe.email, password, body.role === "admin" ? "admin" : "employee");
      if (r.error) return json({ error: r.error === "kullanıcı adı kullanılıyor" ? "Bu kullanıcı adı zaten kullanılıyor" : "Hesap oluşturulamadı. Giriş alan adı (config.js loginDomain) geçerli mi?" }, r.error === "kullanıcı adı kullanılıyor" ? 409 : 400);
      return json({ user: { id: r.id, name, username: pe.username } }, 201);
    }

    case "bulk": {
      const list = Array.isArray(body.employees) ? body.employees.slice(0, 200) : [];
      const created: unknown[] = [];
      const skipped: unknown[] = [];
      for (let i = 0; i < list.length; i++) {
        const name = clean(list[i]?.name, 80);
        const pe = parseEmail(list[i]?.email);
        const username = pe?.username ?? clean(list[i]?.username, 32);
        if (name.length < 2 || !pe) { skipped.push({ row: i + 1, name, username, reason: "geçersiz bilgi" }); continue; }
        const password = genPassword(10);
        const r = await createOne(name, pe.email, password, "employee");
        if (r.error) { skipped.push({ row: i + 1, name, username, reason: r.error }); continue; }
        created.push({ name, username: pe.username, password });
      }
      return json({ created, skipped });
    }

    case "reset": {
      const id = String(body.id ?? "");
      const { data: target } = await admin.from("profiles").select("id, username").eq("id", id).maybeSingle();
      if (!target) return json({ error: "Çalışan bulunamadı" }, 404);
      const password = genPassword(10);
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: "Şifre değiştirilemedi" }, 400);
      return json({ username: target.username, password });
    }

    case "delete": {
      const id = String(body.id ?? "");
      if (id === me.id) return json({ error: "Kendi hesabınızı silemezsiniz" }, 400);
      const { data: target } = await admin.from("profiles").select("id, role").eq("id", id).maybeSingle();
      if (!target) return json({ error: "Çalışan bulunamadı" }, 404);
      if (target.role === "admin") {
        const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
        if ((count ?? 0) <= 1) return json({ error: "Son yönetici silinemez" }, 400);
      }
      const { error } = await admin.auth.admin.deleteUser(id); // profil ve onay kayıtları zincirleme silinir
      if (error) return json({ error: "Hesap silinemedi" }, 400);
      return json({ ok: true });
    }

    default:
      return json({ error: "Bilinmeyen işlem" }, 400);
  }
});
