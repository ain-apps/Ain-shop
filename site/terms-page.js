/* AIN Shop – terms page script (moved out of the page so inline scripts can be refused by the security policy) */
(function () {
  // this page exists in English and Hebrew; the app's other 48 languages see English with a one-line note in their own language
  var I = window.BAIN_I18N, saved = null; try { saved = localStorage.getItem('bain:lang'); } catch (e) {}
  var app = I.code(new URLSearchParams(location.search).get('lang')) || I.code(saved) || I.pick(navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']);
  var lang = (app === 'he' || app === 'yi') ? 'he' : 'en';
  var main = document.querySelector('main'), note = document.createElement('p');
  note.className = 'legalNote'; note.id = 'legalNote';
  if (app !== 'en' && app !== 'he') { I.set(app); note.textContent = I.t('legalNote'); note.setAttribute('lang', app); note.setAttribute('dir', I.dir()); main.insertBefore(note, main.firstChild);  if (window.AIN_LEGAL) { main.insertBefore(AIN_LEGAL.block(I, app, ["tm1", "tm2", "tm3", "tm4", "tm5"]), note.nextSibling); } }   // v21: a short version in their own language above the full text
  function apply() { document.getElementById('en').hidden = lang !== 'en'; document.getElementById('he').hidden = lang !== 'he'; document.documentElement.lang = lang; document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    var b = document.getElementById('langBtn'); b.textContent = lang === 'he' ? 'English' : 'עברית'; b.setAttribute('lang', lang === 'he' ? 'en' : 'he'); b.setAttribute('aria-label', lang === 'he' ? 'English – read this page in English' : 'עברית – קראו את הדף בעברית'); document.title = 'AIN Shop – ' + (lang === 'he' ? "\u05ea\u05e0\u05d0\u05d9 \u05e9\u05d9\u05de\u05d5\u05e9" : "Terms of Use"); }
  // switching this page between English and Hebrew does not change the app language the person chose
  document.getElementById('langBtn').addEventListener('click', function () { lang = lang === 'he' ? 'en' : 'he'; apply(); });
  apply();
})();
