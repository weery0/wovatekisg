/* Supabase istemci kütüphanesini yükler: önce kendi sunucunuzdaki kopya (vendor/supabase.js, varsa),
   olmazsa iki farklı CDN denenir. Yükleme bitince window.sbReady çözülür. */
(function () {
  'use strict';
  var urls = [
    'vendor/supabase.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js',
    'https://unpkg.com/@supabase/supabase-js@2.49.4/dist/umd/supabase.js'
  ];
  window.sbReady = new Promise(function (resolve, reject) {
    (function next(i) {
      if (i >= urls.length) return reject(new Error('Supabase kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edin.'));
      var s = document.createElement('script');
      s.src = urls[i];
      s.onload = function () {
        if (window.supabase && window.supabase.createClient) resolve(window.supabase); else next(i + 1);
      };
      s.onerror = function () { s.remove(); next(i + 1); };
      document.head.appendChild(s);
    })(0);
  });
  window.sbReady.catch(function () { /* hata arayüzde gösterilir */ });
})();
