# سجل موافقة السلامة المهنية (İSG) — WOVATEK MÜHENDİSLİK
موقع ثابت (HTML/CSS/JS) يُستضاف على **GitHub Pages**، والحسابات والبيانات في **Supabase** (PostgreSQL مجاني).

## الخطوات (حوالي 15 دقيقة)

### 1) إنشاء مشروع Supabase
1. سجّل في https://supabase.com وأنشئ **New project** (الخطة المجانية).
2. من **SQL Editor** الصق محتوى `supabase/schema.sql` كاملاً ثم **Run**. (يجب أن يتم هذا **قبل** إنشاء أي مستخدم.)
3. **Authentication → Sign In / Providers → Email**: اترك Email مفعّلاً، وعطّل **Allow new users to sign up** (مهم! حتى لا يسجّل الغرباء بأنفسهم). عطّل "Confirm email" أيضاً.

### 2) إنشاء حساب المدير الأول
**Authentication → Users → Add user → Create new user**: البريد `admin@اسم-نطاقك` (مثال `admin@wovatek.com`) وكلمة مرور قوية، مع تفعيل **Auto Confirm User**.
أول مستخدم يُنشأ يصبح مديراً تلقائياً. اسم المستخدم للدخول = الجزء قبل `@` (هنا `admin`).
(اختياري: غيّر اسمه المعروض: `update public.profiles set name='Ad Soyad' where username='admin';`)

### 3) تعبئة `public/config.js`
من **Project Settings → API** انسخ:
- `supabaseUrl` = Project URL
- `supabaseKey` = مفتاح **anon / publishable** (وليس service_role أبداً)
- `loginDomain` = النطاق الذي استخدمته في بريد المدير (مثال `wovatek.com`). **لا تغيّره لاحقاً.**

### 4) نشر دالة إنشاء الحسابات (Edge Function)
تحتاج إنشاء الموظفين من لوحة التحكم إلى دالة تعمل على الخادم:
- أسهل طريقة: **Edge Functions → Deploy a new function → Via Editor**، الاسم `admin-users`، الصق محتوى `supabase/functions/admin-users/index.ts`، ثم Deploy.
- ثم في إعدادات الدالة **عطّل "Verify JWT"** (الدالة تتحقق بنفسها أن المستدعي مدير).
- أو عبر CLI: `supabase functions deploy admin-users --no-verify-jwt`

### 5) الرفع إلى GitHub
1. أنشئ مستودعاً جديداً (الخطة المجانية تتطلب أن يكون **Public** لتعمل Pages؛ نص القواعد والشعار سيكونان مرئيين للجميع، أما بيانات الموظفين فمحمية بتسجيل الدخول وسياسات RLS).
2. ارفع كل محتويات هذا المجلد (مع مجلد `.github`).
3. **Settings → Pages → Source: GitHub Actions**.
4. بعد أول push يعمل الـ Workflow ويظهر الرابط: `https://اسمك.github.io/اسم-المستودع/`

## الاستخدام
- المدير: يدخل → «Çalışan Ekle» لإضافة موظف أو قائمة موظفين (سطر لكل موظف: `Ad Soyad, kullanıcı.adı`)، تظهر كلمات المرور مرة واحدة فقط.
- الموظف: يدخل → يكتب مكان العمل → يقرأ القواعد حتى النهاية → يوافق.
- لوحة المدير: إحصاءات، تصفية، تصدير Excel وPDF.
- **الموافقة يومية:** تُعدّ موافقة الموظف صالحة لليوم الذي أعطاها فيه فقط (بتوقيت إسطنبول افتراضياً)، وفي اليوم التالي تظهر «Süresi doldu» ويُطلب منه الموافقة من جديد. لتغيير المنطقة الزمنية أضف `timeZone: 'Europe/Istanbul'` في `config.js`. كل موافقة تبقى محفوظة في سجل التاريخ.
- لتحديث نص القواعد: عدّل `public/rules.json` وغيّر `version` فيطلب من الجميع إعادة الموافقة.

## ملاحظات أمنية
- لا تضع مفتاح `service_role` في أي ملف؛ الدالة تستخدمه من بيئة Supabase.
- تغيير كلمة المرور لا يُلغي الجلسات المفتوحة فوراً (تنتهي صلاحيتها خلال ساعة).
- الخطة المجانية في Supabase توقف المشروع بعد أسبوع من عدم النشاط؛ يمكن استئنافه من لوحة التحكم.
- الاختبار: `test/test-rls.sh` (قواعد الأمان على PostgreSQL) و`test/test-function.mjs` (منطق الدالة).
