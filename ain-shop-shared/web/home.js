/* AIN Shop – index page script (moved out of the page so inline scripts can be refused by the security policy) */
// v24 (Nati, Nov 1: "respond quicker"): the splash goes the moment the page is ready (was a fixed 1.6 s + 0.55 s fade, ~2.3 s per open);
// 1.6 s stays only as a safety net. Fade 0.15 s.
(function(){var s=document.getElementById('splash');if(!s)return;var done=false;function hide(){if(done)return;done=true;s.style.transition='opacity .15s ease';s.style.opacity='0';setTimeout(function(){s.remove()},160)}
s.addEventListener('click',hide);if(document.readyState!=='loading')hide();else document.addEventListener('DOMContentLoaded',hide);setTimeout(hide,1600);})();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
