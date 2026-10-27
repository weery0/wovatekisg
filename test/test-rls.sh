#!/bin/bash
# Yerel PostgreSQL'de şema ve RLS testi.  Kullanım: bash test/test-rls.sh
P="psql -h /var/tmp/pgtest -p 5439 -U postgres -X -q -t -A"
$P -d postgres -c "drop database if exists isgtest" -c "create database isgtest" >/dev/null
Q="$P -d isgtest -v ON_ERROR_STOP=1"
$Q -f test/mock-supabase-env.sql >/dev/null
$Q -f supabase/schema.sql >/dev/null && echo "schema: OK"
$Q -f supabase/schema.sql >/dev/null && echo "schema (2. kez, yeniden çalıştırma): OK"
pass=0; failn=0
ok(){ if [ "$2" = "$3" ]; then echo "  ✔ $1"; pass=$((pass+1)); else echo "  ✘ $1  (beklenen: $3 | gelen: $2)"; failn=$((failn+1)); fi; }
# kullanıcı olarak çalıştır: as <uuid|none> <rol> "<sql>"
as(){ local sub="$1" role="$2" sql="$3"; local pre="set role $role;"; [ "$sub" != none ] && pre="$pre set request.jwt.claim.sub='$sub';"; $P -d isgtest -v ON_ERROR_STOP=1 -c "begin; $pre $sql; rollback;" 2>&1 | tr '\n' ' ' | sed 's/BEGIN//;s/ROLLBACK//;s/SET//g;s/^ *//;s/ *$//'; }
A=aaaaaaaa-0000-0000-0000-000000000001; B=bbbbbbbb-0000-0000-0000-000000000002; C=cccccccc-0000-0000-0000-000000000003

echo "[1] Tetikleyici: ilk hesap yönetici"
$Q -c "insert into auth.users(id,email,raw_user_meta_data) values ('$A','admin@sirket.com','{\"role\":\"admin\"}')" \
   -c "insert into auth.users(id,email,raw_user_meta_data) values ('$B','ahmet.y@sirket.com','{\"name\":\"Ahmet Yılmaz\",\"role\":\"admin\"}')" \
   -c "insert into auth.users(id,email) values ('$C','ayse.d@sirket.com')"
ok "ilk kullanıcı = admin"               "$($Q -c "select role from profiles where id='$A'")" "admin"
ok "ikinci kullanıcı = employee (metadata'daki role=admin yok sayıldı)" "$($Q -c "select role from profiles where id='$B'")" "employee"
ok "ad metadata'dan alındı"               "$($Q -c "select name from profiles where id='$B'")" "Ahmet Yılmaz"
ok "ad yoksa kullanıcı adı"               "$($Q -c "select name from profiles where id='$C'")" "ayse.d"

echo "[2] Çalışan (Ahmet)"
ok "yalnızca kendi profilini görür"       "$(as $B authenticated "select count(*) from profiles")" "1"
r=$(as $B authenticated "select acknowledge('  Gebze   GES  Sahası ','2026-10-25')"); ok "acknowledge çalışır" "$(echo $r | grep -c ERROR)" "0"
for w in "  Gebze   GES  Sahası " "Ankara Şubesi"; do $Q -c "set request.jwt.claim.sub='$B'; set role authenticated; select acknowledge('$w','2026-10-25')" >/dev/null; done
$Q -c "set request.jwt.claim.sub='$C'; set role authenticated; select acknowledge('Gebze GES Sahası','2026-10-25')" >/dev/null
ok "boşluklar düzeltildi, 2 kayıt"        "$($Q -c "select string_agg(workplace, '|' order by id) from acknowledgements where user_id='$B'")" "Gebze GES Sahası|Ankara Şubesi"
ok "tarih sunucu saatiyle (≈ şimdi)"      "$($Q -c "select count(*) from acknowledgements where agreed_at > now() - interval '1 minute'")" "3"
ok "doğrudan INSERT reddedilir"           "$(as $B authenticated "insert into acknowledgements(user_id,workplace,version) values ('$B','x yy','1')" | grep -c 'permission denied')" "1"
ok "başkası adına onay yok (RLS/yetki)"   "$(as $B authenticated "insert into acknowledgements(user_id,workplace,version) values ('$C','x yy','1')" | grep -c 'permission denied')" "1"
ok "UPDATE profiles (rol yükseltme) reddedilir" "$(as $B authenticated "update profiles set role='admin' where id='$B'" | grep -c 'permission denied')" "1"
ok "DELETE ack reddedilir"                "$(as $B authenticated "delete from acknowledgements" | grep -c 'permission denied')" "1"
ok "yalnızca kendi onaylarını görür (2)"  "$(as $B authenticated "select count(*) from acknowledgements")" "2"
ok "latest_ack kendi tek satırı"          "$(as $B authenticated "select count(*)||':'||max(workplace) from latest_ack")" "1:Ankara Şubesi"
ok "kısa çalışma yeri reddedilir"         "$(as $B authenticated "select acknowledge('a','1')" | grep -c 'Çalışma yeri adı gerekli')" "1"

echo "[3] Yönetici"
ok "tüm profilleri görür (3)"             "$(as $A authenticated "select count(*) from profiles")" "3"
ok "tüm onayları görür (3)"               "$(as $A authenticated "select count(*) from acknowledgements")" "3"
ok "latest_ack: kişi başına en son (2)"   "$(as $A authenticated "select count(*) from latest_ack")" "2"
ok "Ahmet'in son onayı Ankara"            "$(as $A authenticated "select workplace from latest_ack where user_id='$B'")" "Ankara Şubesi"
ok "yönetici de doğrudan yazamaz"         "$(as $A authenticated "delete from profiles" | grep -c 'permission denied')" "1"

echo "[4] Anonim / oturumsuz"
ok "anon profilleri okuyamaz"             "$(as none anon "select * from profiles" | grep -c 'permission denied')" "1"
ok "anon latest_ack okuyamaz"             "$(as none anon "select * from latest_ack" | grep -c 'permission denied')" "1"
ok "anon acknowledge çağıramaz"           "$(as none anon "select acknowledge('Gebze','1')" | grep -c 'permission denied')" "1"
ok "oturumsuz authenticated acknowledge reddedilir" "$(as none authenticated "select acknowledge('Gebze','1')" | grep -c 'Oturum bulunamadı')" "1"
ok "authenticated handle_new_user çağıramaz" "$(as $B authenticated "select handle_new_user()" | grep -c 'permission denied')" "1"

echo "[5] Silme zinciri"
$Q -c "delete from auth.users where id='$B'" >/dev/null
ok "kullanıcı silinince profil+onaylar silinir" "$($Q -c "select (select count(*) from profiles where id='$B')+(select count(*) from acknowledgements where user_id='$B')")" "0"
echo; echo "SONUÇ: $pass geçti, $failn kaldı"; [ $failn -eq 0 ]
