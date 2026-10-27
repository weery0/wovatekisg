/* Bu dosyayı kendi Supabase bilgilerinizle doldurun (README.md, 3. adım).
   Buradaki anahtar "public/anon" anahtarıdır: tarayıcıda görünmesi normaldir, veriyi
   veritabanındaki satır düzeyi güvenlik (RLS) kuralları korur.
   ASLA "service_role" veya "secret" anahtarını bu dosyaya yazmayın. */
window.APP_CONFIG = {
  // Supabase > Project Settings > API > Project URL
  supabaseUrl: 'https://gkebljpijjdlhqdfbrfa.supabase.co',

  // Supabase > Project Settings > API > "anon public" (veya "publishable") anahtarı
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrZWJsanBpampkbGhxZGZicmZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MzgwNzIsImV4cCI6MjEwODUxNDA3Mn0.nTg0_ElrEDDCk1k8YzMo_Hz20OHs6tCUBZz4fDQsiw4',

  // Çalışanlar yalnızca kullanıcı adıyla giriş yapar (örn. ahmet.y). Sistem bunu arka planda
  // ahmet.y@ALAN-ADI biçiminde bir e-postaya çevirir. Gerçek bir e-posta kutusu gerekmez.
  // Şirketinizin gerçek alan adını yazın (örn. wovatek.com.tr). Sonradan DEĞİŞTİRMEYİN.
  loginDomain: 'mail.com'
};
