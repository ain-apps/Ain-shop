/* AIN Shop – contact page script (moved out of the page so inline scripts can be refused by the security policy) */
(function () {
  // this page exists in English and Hebrew; the app's other 48 languages see English with a one-line note in their own language
  var I = window.BAIN_I18N, saved = null; try { saved = localStorage.getItem('bain:lang'); } catch (e) {}
  var app = I.code(new URLSearchParams(location.search).get('lang')) || I.code(saved) || I.pick(navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']);
  var lang = (app === 'he' || app === 'yi') ? 'he' : 'en';
  var main = document.querySelector('main'), note = document.createElement('p');
  note.className = 'legalNote'; note.id = 'legalNote';
  if (app !== 'en' && app !== 'he') { I.set(app); note.textContent = I.t('legalNote'); note.setAttribute('lang', app); note.setAttribute('dir', I.dir()); main.insertBefore(note, main.firstChild);
    // the corrections line in the app's own language (all 50), right under the note
    var cp = document.createElement('p'), ca = document.createElement('a'); cp.className = 'legalNote corrP'; cp.id = 'corrNote'; cp.setAttribute('lang', app); cp.setAttribute('dir', I.dir());
    ca.href = 'mailto:ainshop.corrections@mail.tab.bot?subject=AIN%20Shop%20correction'; ca.textContent = I.t('corrLine', { email: 'ainshop.corrections@mail.tab.bot' }); cp.appendChild(ca); main.insertBefore(cp, note.nextSibling);
    if (window.AIN_LEGAL) { var sb = AIN_LEGAL.block(I, app, ["ct1", "ct2"]); sb.appendChild(AIN_LEGAL.clearButton(I, app)); main.insertBefore(sb, cp.nextSibling); } }   // v21: a short version in their own language, with the delete-on-this-phone button
  function apply() { document.getElementById('en').hidden = lang !== 'en'; document.getElementById('he').hidden = lang !== 'he'; document.documentElement.lang = lang; document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    var b = document.getElementById('langBtn'); b.textContent = lang === 'he' ? 'English' : 'עברית'; b.setAttribute('lang', lang === 'he' ? 'en' : 'he'); b.setAttribute('aria-label', lang === 'he' ? 'English – read this page in English' : 'עברית – קראו את הדף בעברית'); document.title = 'AIN Shop – ' + (lang === 'he' ? "\u05d9\u05e6\u05d9\u05e8\u05ea \u05e7\u05e9\u05e8" : "Contact"); }
  // switching this page between English and Hebrew does not change the app language the person chose
  document.getElementById('langBtn').addEventListener('click', function () { lang = lang === 'he' ? 'en' : 'he'; apply(); });
  // v21: the delete-on-this-phone buttons in the English and Hebrew text
  if (window.AIN_LEGAL) Array.prototype.forEach.call(document.querySelectorAll('[data-clear-here]'), function (el) { el.appendChild(AIN_LEGAL.clearButton(I, el.getAttribute('data-clear-here'))); });
  apply();
})();
