/* AIN Shop – join page script (moved out of the page so inline scripts can be refused by the security policy) */
(function () {
  var I = window.BAIN_I18N, F = { name: 'j_fName', website: 'j_fWebsite', email: 'j_fEmail', feed: 'j_fFeed', permission: 'j_fPermission' };
  var q = new URLSearchParams(location.search).get('lang'), saved = null; try { saved = localStorage.getItem('bain:lang'); } catch (e) {}
  var lang = I.code(q) || I.code(saved) || I.pick(navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']);
  var T = function (k) { return I.t('j_' + k); };
  function $(id) { return document.getElementById(id); }
  // the language list: a native picker (big on a phone, read by VoiceOver), each language in its own name
  var sel = $('langSel');
  I.list().forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = I.LANGS[c].name; o.setAttribute('lang', c); sel.appendChild(o); });
  function apply() {
    I.set(lang); document.documentElement.lang = lang; document.documentElement.dir = I.dir(); document.title = T('title');
    $('h1').textContent = T('title'); $('intro').textContent = T('intro'); $('lName').textContent = T('name'); $('lWeb').textContent = T('web'); $('lEmail').textContent = T('email');
    $('lFeed').textContent = T('feed'); $('lNote').textContent = T('note'); $('lPerm').textContent = T('perm'); $('send').textContent = T('send');
    sel.value = lang; $('lLang').textContent = I.t('langBtn'); sel.setAttribute('aria-label', I.t('langBtnLabel', { name: I.LANGS[lang].name }));
  }
  sel.addEventListener('change', function () { var c = I.code(sel.value); if (!c) return; lang = c; try { localStorage.setItem('bain:lang', lang); } catch (e) {} apply(); });
  apply();
  $('f').addEventListener('submit', function (e) {
    e.preventDefault(); var m = $('msg'); m.className = ''; m.textContent = T('sending'); $('send').disabled = true;
    fetch('/api/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: $('name').value, website: $('website').value, email: $('email').value, feed: $('feed').value, note: $('note').value, permission: $('perm').checked, company_fax: $('company_fax').value, lang: lang }) })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (x) {
        $('send').disabled = false;
        if (x.j.ok) { m.textContent = T('ok'); $('f').reset(); return; }
        m.className = 'err';
        if (x.s === 429) m.textContent = T('limit');
        else if (x.j.fields) { m.textContent = T('bad') + x.j.fields.map(function (f) { return F[f] ? I.t(F[f]) : f; }).join(', '); var first = { name: 'name', website: 'website', email: 'email', feed: 'feed', permission: 'perm' }[x.j.fields[0]]; if (first) $(first).focus(); }
        else m.textContent = T('network');
      }).catch(function () { $('send').disabled = false; m.className = 'err'; m.textContent = T('network'); });
  });
  apply();
})();
