-- ============================================================================
-- WOVATEK MÜHENDİSLİK — İSG Onay Kaydı : Supabase veritabanı şeması
-- Supabase panelinde: SQL Editor > New query > bu dosyanın tamamını yapıştırın > Run
-- Tekrar çalıştırmak güvenlidir (var olan veriyi silmez).
-- ============================================================================

-- 1) Tablolar -----------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique,
  name       text not null,
  role       text not null default 'employee' check (role in ('admin', 'employee')),
  created_at timestamptz not null default now()
);

create table if not exists public.acknowledgements (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  workplace text not null check (char_length(workplace) between 2 and 80),
  version   text not null,
  agreed_at timestamptz not null default now()
);

create index if not exists acknowledgements_user_idx
  on public.acknowledgements (user_id, agreed_at desc);

-- 2) Yardımcı: oturumdaki kullanıcı yönetici mi? ------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 3) Satır düzeyi güvenlik (RLS) ----------------------------------------------
alter table public.profiles         enable row level security;
alter table public.acknowledgements enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists ack_select on public.acknowledgements;
create policy ack_select on public.acknowledgements
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Not: INSERT / UPDATE / DELETE için politika YOKTUR. Tarayıcıdan hiç kimse
-- doğrudan yazamaz. Onay yalnızca aşağıdaki acknowledge() fonksiyonuyla kaydedilir;
-- hesap işlemleri ise yalnızca "admin-users" Edge Function ile yapılır.

-- 4) Onay kaydı: tarih sunucu saatiyle yazılır, kimse başkası adına onay veremez --
create or replace function public.acknowledge(p_workplace text, p_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  wp text := left(trim(regexp_replace(coalesce(p_workplace, ''), '\s+', ' ', 'g')), 80);
begin
  if auth.uid() is null then
    raise exception 'Oturum bulunamadı' using errcode = '28000';
  end if;
  if char_length(wp) < 2 then
    raise exception 'Çalışma yeri adı gerekli' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Profil bulunamadı' using errcode = '28000';
  end if;
  insert into public.acknowledgements (user_id, workplace, version)
  values (auth.uid(), wp, left(coalesce(p_version, ''), 40));
end;
$$;

-- 5) Her çalışanın en son onayı (yönetici tüm satırları, çalışan yalnızca kendisini görür)
create or replace view public.latest_ack
with (security_invoker = true)
as
  select distinct on (user_id) user_id, workplace, version, agreed_at
  from public.acknowledgements
  order by user_id, agreed_at desc, id desc;

-- 6) Yeni hesap oluşunca profil satırı: İLK hesap yönetici, diğerleri çalışan ----
-- Rol bilgisi kullanıcının değiştirebildiği metadata'dan ALINMAZ.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text := lower(split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, username, name, role)
  values (
    new.id,
    uname,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), uname),
    case when exists (select 1 from public.profiles) then 'employee' else 'admin' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 7) Yetkiler -------------------------------------------------------------------
revoke all on public.profiles, public.acknowledgements, public.latest_ack from anon, authenticated;
grant select on public.profiles, public.acknowledgements, public.latest_ack to authenticated;

revoke execute on function public.acknowledge(text, text) from public, anon;
grant  execute on function public.acknowledge(text, text) to authenticated;
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ============================================================================
-- İsteğe bağlı: ilk yöneticinin görünen adını değiştirmek için (kendi bilginizle düzenleyip çalıştırın)
--   update public.profiles set name = 'Ad Soyad' where username = 'admin';
-- ============================================================================
