/* AIN Shop v28 — a FULLY VOICE app (Nati, Nov 1 2026 12:23 AM: "I want every command that we have any button for to have an option by voice";
   12:25 AM: "not only in Hebrew and English"). Every button / link / setting has a whole-sentence command, in the app's language + English always
   (words: vcmd-i18n.js, one block per language of the 50, merged into BAIN_I18N.LANGS[code].v). Shared by the typed box, the voice call (ai.js)
   and the Yes/No box's "Answer by voice" button.
   - match(): the WHOLE sentence must be a command (polite filler like "please" / "בבקשה" / "ביטע" around it is fine) — "fast shipping",
     "open box tv", "close up cream" or "camera" alone are never commands; a product search stays a product search.
   - Anything that deletes, buys, pays or submits (go to checkout, subscribe, cancel the subscription, remove from list, forget history,
     forget location, delete my data) first asks the big Yes/No box (AIN_LEGAL.confirm, the v23 clearAsk box) — answered by tap or by voice.
   - Every command answers with a short spoken confirmation (in a call the AI says exactly that line; otherwise the phone's own voice). */
(function (root) {
  'use strict';
  var I = root.BAIN_I18N;
  function APP() { return root.BAIN_APP; }
  function $(id) { return document.getElementById(id); }
  function N(s) { return root.BAIN_INTENT ? BAIN_INTENT.normalize(s) : String(s == null ? '' : s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
  function V(code) { var L = I.LANGS[code]; return (L && L.v) || null; }
  function cur() { return I.lang || 'en'; }
  function langsNow() { var c = cur(), a = [c]; if (c !== 'en') a.push('en'); return a; }
  // a spoken line in the screen language, English when this language lacks it
  function say$(k, v) { var c = cur(), L = V(c), s = (L && L.s && L.s[k]) || (V('en').s[k]) || ''; return String(s).replace(/\{(\w+)\}/g, function (_, n) { return v && v[n] != null ? v[n] : ''; }); }

  // ---------------- matching ----------------
  var SLOT = { n: 'qqnqq', ord: 'qqordqq', lang: 'qqlangqq', store: 'qqstoreqq' };
  var CACHE = {};
  // articles / possessives dropped on both sides for a second, looser lookup ("abre la configuración" = "abrir configuración"'s sibling "abre configuración")
  var ART = {}; ('the a an my me el la los las un una mi mis le les l un une mon ma mes du de des der die das den dem des ein eine einen meine mein meinen il lo gli i uno o os as um uma meu minha minhas meus het een mijn den det en ett min mitt mina ' +
    'az egy a az moj moja moje mój moja mojego ten ta to').split(' ').forEach(function (w) { if (w) ART[w] = 1; });
  function loose(t) { var a = t.split(' '), b = a.filter(function (w) { return !ART[w]; }); return b.length && b.length < a.length ? b.join(' ') : null; }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function compile(code) {
    if (CACHE[code]) return CACHE[code];
    var L = V(code); if (!L) return null;
    var exact = {}, pats = [], lx = {};
    Object.keys(L.w || {}).forEach(function (id) {
      (L.w[id] || []).forEach(function (ph) {
        var raw = String(ph).replace(/\{(n|ord|lang|store)\}/g, function (_, k) { return ' ' + SLOT[k] + ' '; });
        // Hebrew / Yiddish prefixes glued to a slot ("ל{lang}", "ה{ord}") stay glued
        raw = raw.replace(/([\u05d0-\u05ea]) (qq(?:n|ord|lang|store)qq)/g, '$1$2');
        var n = N(raw); if (!n) return;
        if (!/qq(n|ord|lang|store)qq/.test(n)) { (exact[n] = exact[n] || []).indexOf(id) < 0 && exact[n].push(id); var ln = loose(n) || n; (lx[ln] = lx[ln] || []).indexOf(id) < 0 && lx[ln].push(id); return; }
        var names = [], src = '^' + n.split(/(qq(?:n|ord|lang|store)qq)/).map(function (part) {
          var m = /^qq(n|ord|lang|store)qq$/.exec(part); if (m) { names.push(m[1]); return '(.+?)'; }
          return esc(part).replace(/^ /, ' ?').replace(/ $/, ' ?');   // a slot may touch its words (Chinese, Japanese, Amharic suffixes, Hebrew prefixes)
        }).join('') + '$';
        try { pats.push({ id: id, re: new RegExp(src), slots: names, len: n.length }); } catch (e) {}
      });
    });
    pats.sort(function (a, b) { return b.len - a.len; });
    var fill = (L.fill || []).map(N).filter(Boolean).sort(function (a, b) { return b.length - a.length; }).map(esc);
    var sp = /^(zh|ja|th)/.test(code) ? ' ?' : ' ';   // Chinese, Japanese, Thai: no spaces between words
    var F = fill.length ? { lead: new RegExp('^(?:(?:' + fill.join('|') + ')' + sp + ')+'), tail: new RegExp('(?:' + sp + '(?:' + fill.join('|') + '))+$') } : null;
    var num = {}; Object.keys(L.num || {}).forEach(function (k) { (L.num[k] || []).forEach(function (w) { var x = N(w); if (x) num[x] = +k; }); });
    var names = {}; Object.keys(L.names || {}).forEach(function (c) { [].concat(L.names[c] || []).forEach(function (w) { var x = N(w); if (x) names[x] = c; }); });
    return (CACHE[code] = { exact: exact, lx: lx, pats: pats, F: F, num: num, names: names });
  }
  function strip(t, C) {
    if (!C || !C.F) return t; var u = t, prev;
    do { prev = u; u = u.replace(C.F.lead, '').replace(C.F.tail, '').trim(); } while (u && u !== prev);
    return u || t;
  }
  function numOf(s, codes) {
    s = N(s).replace(/^(?:number|no|nummer|נומער|מספר|item) /, '').replace(/^ה(?=[\u05d0-\u05ea])/, function (m) { return m; });
    if (/^\d{1,2}$/.test(s)) return +s;
    for (var i = 0; i < codes.length; i++) { var C = compile(codes[i]); if (!C) continue; if (C.num[s]) return C.num[s]; var s2 = s.replace(/^(?:ה|דעם |די |the )/, ''); if (C.num[s2]) return C.num[s2]; }
    return null;
  }
  function langOf(s, codes) {
    var x = N(s); if (!x) return null;
    var c = /^[a-z]{1,3}(?: [a-z]{1,4})?$/.test(x) ? null : (I.code(s) || I.code(x)); if (c) return c;   // a language NAME, never a code ("no" is not Norwegian, "it" is not Italian)
    var all = codes.concat(['en']);
    for (var i = 0; i < all.length; i++) { var C = compile(all[i]); if (C && C.names[x]) return C.names[x]; }
    for (var k in I.LANGS) if (N(I.LANGS[k].name) === x || N(I.LANGS[k].en) === x) return k;
    return null;
  }
  function storeOf(s) {
    var ST = root.BAIN_STORES, CO = root.BAIN_CO, x = String(s || '').trim(); if (!x) return null;
    var gs = CO && CO.groups ? CO.groups() : [];
    for (var i = 0; i < gs.length; i++) if (ST && ST.same ? ST.same(gs[i].store, x) : N(gs[i].store) === N(x)) return { store: gs[i].store, group: gs[i] };
    var p = ST && ST.find ? ST.find(x) : null; if (p) return { store: p.name, place: p };
    return null;
  }
  // all readings of the sentence: [{ id, arg }], best first
  function readings(text) {
    var codes = langsNow(), t0 = N(text); if (!t0 || t0.length > 90) return [];
    var forms = [t0]; if (root.BAIN_INTENT && BAIN_INTENT.fix) { var f = BAIN_INTENT.fix(text); if (f && forms.indexOf(f) < 0) forms.push(f); }
    var out = [], seen = {};
    function add(id, arg, q) { var k = id + '|' + JSON.stringify(arg || null); if (seen[k] == null) { seen[k] = out.length; out.push({ id: id, arg: arg || null, q: q || 0 }); } else if ((q || 0) < out[seen[k]].q) out[seen[k]].q = q || 0; }
    codes.forEach(function (code) {
      var C = compile(code); if (!C) return;
      forms.forEach(function (t) {
        var u = [t, strip(t, C)].filter(function (x, i, a) { return x && a.indexOf(x) === i; });
        u = u.map(function (x) { return x.split(' ').filter(function (w, i, a) { return w !== a[i - 1]; }).join(' '); }).concat(u);   // "close close" = "close"
        u.forEach(function (x) {
          var q = x === t ? 0 : 1;   // the words exactly as said beat the same words with the filler taken off ("לא עכשיו" = not now, not "no")
          (C.exact[x] || []).forEach(function (id) { add(id, null, q); });
          var lz = x.indexOf(' ') > 0 ? loose(x) : null; if (lz) (C.lx[lz] || []).forEach(function (id) { add(id, null, q + 0.5); });
          C.pats.forEach(function (p) {
            var m = p.re.exec(x); if (!m) return; var arg = {}, okk = true;
            p.slots.forEach(function (k, i) {
              var v = m[i + 1];
              if (k === 'n' || k === 'ord') { var n = numOf(v, codes); if (n == null || n < 1 || n > 60) okk = false; else arg.n = n; }
              else if (k === 'lang') { var l = langOf(v, codes); if (!l) okk = false; else arg.lang = l;
                // a language name ALONE switches only by its own name ("Polski", "Français", "עברית", "English") or the Hebrew / Yiddish name — so "polish", "thai", "danish" stay searches
                if (l && p.re.source === '^(.+?)$' && N(I.LANGS[l].name) !== N(v) && !(/^(he|yi)$/.test(code) && /[\u05d0-\u05ea]/.test(v))) okk = false; }
              else if (k === 'store') { var s = storeOf(v); if (!s) okk = false; else arg.store = s.store; }
            });
            if (okk) add(p.id, arg, q);
          });
        });
      });
    });
    return out;
  }

  // ---------------- what is on the screen now ----------------
  function shown(id) { var e = $(id); return !!(e && !e.hidden && (e.open || e.getAttribute('data-open') === '1' || e.tagName !== 'DIALOG')); }
  function screen() {
    var A = APP(), S = A ? A.S : {}, CO = root.BAIN_CO, BC = root.BAIN_BC, L = root.AIN_LEGAL, P = root.BAIN_PAY;
    var cam = $('camBox'), co = CO && CO.current ? CO.current() : null, bc = BC && BC.last ? BC.last() : null;
    return {
      confirm: !!(L && L.pending && L.pending()),
      lang: !!(A && A.langOpen && A.langOpen()),
      pay: !!(P && P.isOpen && P.isOpen()),
      loc: !!($('locDlg') && ($('locDlg').open || $('locDlg').hasAttribute('open'))),
      cam: !!(cam && !cam.hidden),
      bc: !!(bc && (bc.kind === 'barcode' || bc.kind === 'qr') && $('bcResult') && !$('bcResult').hidden), bcQr: !!(bc && bc.kind === 'qr' && bc.qr && bc.qr.https), bcFound: !!(bc && bc.kind === 'barcode' && bc.lookup && bc.lookup.found),
      co: !!(co && co.info), coUrl: !!(co && co.info && co.info.checkout_url), coAdd: !!(co && co.info && co.info.url && !co.info.needs_choice && co.info.path !== 'sold_out'),
      results: !!(S.results && S.results.length), list: !!(CO && CO.list && CO.list().length),
      hist: !!(root.BAIN_HIST && BAIN_HIST.all().length), notice: shown('notice'),
      call: !!(root.BAIN_AI && BAIN_AI.active())
    };
  }
  // ids the voice call leaves to the AI (it has a tool for each and speaks the result itself — v20 "EVERYTHING BY VOICE")
  var AI_IN_CALL = { lang: 1, report: 1, track: 1, 'return': 1, carts: 1, all_stores: 1, camera: 1, take: 1, cam_close: 1, barcode: 1, bc_buy: 1, bc_ingr: 1, bc_desc: 1, bc_open: 1,
    co_help: 1, card_help: 1, co_add: 1, buy_n: 1, open_n: 1, desc_n: 1, list_read: 1, again_n: 1, loc_use: 1, restore: 1, store_close: 1, next: 1, back: 1, stop: 1,
    speed_fast: 1, speed_normal: 1, speed_slow: 1, speed_ask: 1, clear: 1, notice_ok: 1, talk_start: 1 };
  // handled by older code paths (typed box chain / ai.js), listed here so "what can I say" can read them and the audit table is complete
  var OLD_TYPED = { speed_fast: 1, speed_normal: 1, speed_slow: 1, speed_ask: 1, clear: 1, report: 1, track: 1, 'return': 1, carts: 1, all_stores: 1, loc_use: 1 };
  function avail(id, sc, how) {
    var inCall = how === 'call';
    if (sc.confirm) return id === 'yes' || id === 'no' || id === 'help';   // the Yes/No box is the whole screen now
    if (id === 'yes' || id === 'no') return false;
    if (inCall && AI_IN_CALL[id]) return false;
    if (!inCall && OLD_TYPED[id]) return false;
    switch (id) {
      case 'loc_yes': case 'loc_no': case 'loc_later': return sc.loc;
      case 'talk_end': return inCall || sc.call;
      case 'talk_start': return !sc.call && !inCall;
      case 'notice_ok': return sc.notice && !inCall;
      case 'take': return sc.cam;
      case 'cam_close': return sc.cam || sc.bc;
      case 'bc_buy': return sc.bcFound; case 'bc_ingr': return sc.bcFound; case 'bc_desc': return sc.bc && !sc.bcFound && !sc.bcQr; case 'bc_open': return sc.bcQr;
      case 'co_help': case 'card_help': return sc.co || !!(root.BAIN_CO && BAIN_CO.lastCo && BAIN_CO.lastCo());
      case 'co_add': return sc.coAdd;
      case 'go_checkout': return !sc.pay && (sc.coUrl || sc.list);
      case 'buy_n': case 'open_n': case 'desc_n': case 'show_n': return sc.results;   // v30 show_n: light up + scroll to that item
      case 'next': case 'back': return sc.results;
      case 'list_remove': return sc.list;
      case 'again_n': case 'forget_n': case 'hist_more': case 'hist_less': return sc.hist;
      case 'subscribe': case 'cancel_sub': case 'restore': return !!root.BAIN_PAY;
      case 'stop': return true;
      case 'close': return sc.lang || sc.pay || sc.loc || sc.cam || sc.bc || !$('ordSec').hidden || sc.notice;
    }
    return true;
  }
  var ORDER = ['yes', 'no', 'loc_yes', 'loc_no', 'loc_later', 'help', 'close', 'talk_end', 'talk_start', 'speed_fast', 'speed_normal', 'speed_slow', 'speed_ask', 'clear', 'hist_clear', 'loc_forget',
    'cancel_sub', 'subscribe', 'restore', 'plan', 'settings', 'cam_close', 'take', 'camera', 'barcode', 'bc_open', 'bc_ingr', 'bc_buy', 'bc_desc', 'co_help', 'card_help', 'co_add',
    'list_remove', 'forget_n', 'again_n', 'buy_n', 'open_n', 'desc_n', 'show_n', 'show_cur', 'go_checkout', 'list_read', 'hist_more', 'hist_less', 'privacy', 'terms', 'contact', 'join', 'tip', 'report',
    'track', 'return', 'carts', 'all_stores', 'loc_use', 'notice_ok', 'store_close', 'lang', 'stop', 'next', 'back'];
  function rank(id) { var i = ORDER.indexOf(id); return i < 0 ? 999 : i; }
  // the command this whole sentence is, on this screen, for this path (how: 'typed' | 'call'), or null
  function match(text, how) {
    var sc = screen(), rs = readings(text).filter(function (r) { return avail(r.id, sc, how); });
    if (how === 'call') rs = rs.filter(function (r) { return !(r.id === 'lang' && !r.arg); });
    rs.sort(function (a, b) { return (a.q - b.q) || (rank(a.id) - rank(b.id)); });
    return rs[0] || null;
  }
  function yesNo(text) { var rs = readings(text); for (var i = 0; i < rs.length; i++) if (rs[i].id === 'yes' || rs[i].id === 'no') return rs[i].id; return null; }

  // ---------------- doing it ----------------
  // r = { say: line to speak (or ''), ask: { q, run: fn → line } (the Yes/No box first), silent: the action speaks for itself }
  function phrase(id, code) {
    var L = V(code || cur()) || V('en'), w = (L.w && L.w[id] && L.w[id][0]) || (V('en').w[id] || [''])[0];
    var A = APP(), ex = A && A.S && A.S.results && A.S.results.length ? 1 : 2;
    return String(w).replace(/\{n\}/g, '2').replace(/\{ord\}/g, (L.num && L.num['2'] && L.num['2'][0]) || '2').replace(/\{lang\}/g, I.LANGS.en.name).replace(/\{store\}/g, (root.BAIN_CO && BAIN_CO.groups && BAIN_CO.groups()[0] && BAIN_CO.groups()[0].store) || 'Walmart');
  }
  function helpIds(sc, inCall) {
    if (sc.confirm) return ['yes', 'no'];
    if (sc.loc) return ['loc_yes', 'loc_no', 'loc_later'];
    if (sc.lang) return ['speed_fast', 'speed_slow', 'speed_normal', 'lang', 'clear', 'close'];
    if (sc.pay) return ['subscribe', 'cancel_sub', 'restore', 'close'];
    if (sc.cam) return ['take', 'cam_close'];
    if (sc.bc) return sc.bcFound ? ['bc_buy', 'bc_ingr', 'cam_close', 'scan_again'] : sc.bcQr ? ['bc_open', 'cam_close'] : ['bc_desc', 'cam_close'];
    var a = [];
    if (sc.co) a = a.concat(['go_checkout', 'co_add', 'co_help', 'card_help']);
    else if (sc.results) a = a.concat(['open_n', 'buy_n', 'desc_n', 'show_n', 'next']);
    if (sc.list) a = a.concat(['list_read', 'list_remove']);
    if (sc.hist && a.length < 6) a.push('again_n');
    a = a.concat(['settings', 'barcode', 'camera', 'track', 'return', 'plan', 'privacy']);
    a.push(inCall ? 'talk_end' : 'talk_start');
    return a.filter(function (x, i, arr) { return arr.indexOf(x) === i; }).slice(0, 10);
  }
  function helpText(how) {
    var sc = screen(), inCall = how === 'call' || sc.call, ids = helpIds(sc, inCall).filter(function (x) { return x !== 'scan_again'; });
    var list = ids.map(function (id) { return '“' + phrase(id) + '”'; }).join(', ');
    var tail = (sc.confirm || sc.loc || sc.lang || sc.pay || sc.cam || sc.bc) ? '' : ' ' + say$('helpSearch');
    return say$('helpIntro') + ' ' + list + '.' + tail;
  }
  function nav(path) {   // a page of the app (privacy / terms / contact / join): a call ends first, then the page opens
    if (root.__AIN_TEST_NAV) return root.__AIN_TEST_NAV(path);   // tests only
    setTimeout(function () { try { if (root.BAIN_AI && BAIN_AI.active()) BAIN_AI.stop('user'); } catch (e) {} try { location.href = path; } catch (e) {} }, 1600);
  }
  var pendingTip = null;
  document.addEventListener('pointerdown', function (e) {
    if (!pendingTip) return; var u = pendingTip; pendingTip = null; e.preventDefault(); e.stopPropagation();
    var w = null; try { w = window.open(u, '_blank', 'noopener'); } catch (x) {} if (!w) location.href = u;
  }, true);
  function tip() {
    var a = $('shopTip'); if (!a) return say$('notHere');
    var w = null; try { w = window.open(a.href, '_blank', 'noopener'); } catch (e) {}
    if (w) return say$('tip');
    pendingTip = a.href; try { a.focus(); } catch (e) {} return say$('tip') + ' ' + say$('tipTap');
  }
  function closeTop(sc) {
    var A = APP();
    if (sc.pay && root.BAIN_PAY) { BAIN_PAY.close(); return true; }
    if (sc.loc) { var lt = $('locLater'); if (lt) lt.click(); return true; }
    if (sc.lang && A && A.closeLang) { A.closeLang(); return true; }
    if (sc.cam || sc.bc) { var cc = $('camClose'); if (cc && sc.cam) cc.click(); else { var r = $('bcResult'); if (r) r.hidden = true; if (root.BAIN_BC && BAIN_BC.stop) BAIN_BC.stop(); } return true; }
    var os = $('ordSec'); if (os && !os.hidden) { var c = os.querySelector('button.small'); if (c) c.click(); else os.hidden = true; return true; }
    if (sc.notice) { if (A && A.markNotice) A.markNotice(); $('notice').hidden = true; return true; }
    return false;
  }
  function item(n) { var A = APP(), S = A.S; return n >= 1 && n <= S.results.length ? n - 1 : -1; }
  function speakList() {
    var CO = root.BAIN_CO, a = CO.list(); if (!a.length) return say$('noList');
    if (root.BAIN_STORES && BAIN_STORES.cartsSentence && CO.groups().length > 1) return BAIN_STORES.cartsSentence();
    return say$('yourList', { items: a.map(function (x, i) { return (i + 1) + '. ' + (root.AIN_TEXT && AIN_TEXT.shortName ? AIN_TEXT.shortName(x) : x.title) + (x.qty > 1 ? ' ×' + x.qty : ''); }).join(', ') });
  }
  function checkoutTarget(arg) {
    var CO = root.BAIN_CO, co = CO.current && CO.current(), gs = CO.groups ? CO.groups() : [];
    if (arg && arg.store) { for (var i = 0; i < gs.length; i++) if (gs[i].store === arg.store) return { group: gs[i], store: gs[i].store }; }
    if (co && co.info && co.info.checkout_url && !(arg && arg.store)) return { co: co.info, store: co.info.store };
    if (gs.length === 1) return { group: gs[0], store: gs[0].store };
    if (gs.length > 1) { var act = root.BAIN_STORES && BAIN_STORES.active && BAIN_STORES.active(); if (act) for (var j = 0; j < gs.length; j++) if (gs[j].store === act.name) return { group: gs[j], store: gs[j].store }; return { which: gs.map(function (g) { return g.store; }) }; }
    return null;
  }
  function goCheckout(tg) {   // the same thing the "Go to checkout" / "Checkout at {store}" links do (their own tracking + click handlers)
    var sel = tg.co ? '#coBox a.btn' : null, a = null;
    if (sel) a = document.querySelector(sel);
    if (!a && tg.group) { var hs = document.querySelectorAll('#listBox .cartBox'); for (var i = 0; i < hs.length; i++) { var h = hs[i].querySelector('.cartH'); if (h && h.textContent.indexOf(tg.store) >= 0) { a = hs[i].querySelector('a.btn'); break; } } if (!a) a = document.querySelector('#listBox a.btn'); }
    if (!a) return false;
    setTimeout(function () { try { a.click(); } catch (e) {} if (!a.target) { /* same-tab link: the click navigates */ } }, 900);
    return true;
  }
  function run(m, how) {
    var A = APP(), S = A.S, id = m.id, arg = m.arg || {}, sc = screen(), CO = root.BAIN_CO, H = root.BAIN_HIST, LO = root.BAIN_LOC, P = root.BAIN_PAY, BC = root.BAIN_BC;
    var inCall = how === 'call' || sc.call;
    switch (id) {
      case 'help': return { say: helpText(how) };
      case 'settings': if (A.openLang && !A.langOpen()) A.openLang(); return { say: say$('settings') };
      case 'close': closeTop(sc); return { say: say$('close') };
      case 'lang': { var l = A.setLang(arg.lang); if (!l) return { say: say$('notHere') }; return { say: say$('lang', { name: I.LANGS[l].name }) }; }
      case 'privacy': nav('/privacy'); return { say: say$('privacy') };
      case 'terms': nav('/terms'); return { say: say$('terms') };
      case 'contact': nav('/contact'); return { say: say$('contact') };
      case 'join': nav('/join'); return { say: say$('join') };
      case 'tip': return { say: tip() };
      case 'notice_ok': closeTop({ notice: true }); return { say: say$('notice_ok') };
      case 'talk_start': setTimeout(function () { if (root.BAIN_AI && !BAIN_AI.active()) BAIN_AI.start(); }, 50); return { say: '' };
      case 'talk_end': setTimeout(function () { if (root.BAIN_AI && BAIN_AI.active()) BAIN_AI.stop('user'); }, 30); return { say: say$('talk_end'), after: true };
      case 'plan': if (P) { (P.refresh ? P.refresh() : Promise.resolve()).then(function () { P.open(false); }); } return { say: say$('plan') };
      case 'subscribe': return { ask: { q: say$('subscribeQ'), run: function () { P.subscribe(false); return ''; } } };
      case 'cancel_sub': return { ask: { q: say$('cancelQ'), run: function () { P.cancel(false); return ''; } } };
      case 'restore': P.restore(false); return { say: say$('restore') };
      case 'camera': { var cb = $('camBtn'); if (cb) cb.click(); return { say: say$('camera') }; }
      case 'take': { var ct = $('camTake'); if (ct) ct.click(); return { say: say$('take') }; }
      case 'cam_close': closeTop({ cam: sc.cam, bc: sc.bc }); return { say: say$('cam_close') };
      case 'barcode': { var bb = $('bcBtn'); if (bb) bb.click(); return { say: say$('barcode') }; }
      case 'bc_buy': { var b1 = $('bcBuyBtn'); if (b1) b1.click(); return { say: say$('bc_buy') }; }
      case 'bc_ingr': { var b2 = $('bcIngrBtn'); if (b2) b2.click(); return { silent: true }; }
      case 'bc_desc': { var b3 = $('bcDescBtn'); if (b3) b3.click(); return { say: say$('camera') }; }
      case 'bc_open': { var b4 = $('bcOpen'); if (b4) b4.click(); return { say: say$('bc_open') }; }
      case 'co_help': A.sayNative(CO.helpText()); return { silent: true };
      case 'card_help': A.sayNative(A.t('cardHelp')); return { silent: true };
      case 'co_add': { var co = CO.current(); if (co && co.info) CO.addToList(co.info); return { say: say$('co_add') }; }
      case 'go_checkout': {
        var tg = checkoutTarget(arg); if (!tg) return { say: say$('noList') };
        if (tg.which) return { say: say$('checkoutWhich', { list: tg.which.join(', ') }) };
        return { ask: { q: say$('checkoutQ', { store: tg.store }), run: function () { goCheckout(tg); return say$('checkoutGo', { store: tg.store }); } } };
      }
      case 'buy_n': { var i1 = item(arg.n); if (i1 < 0) return { say: say$('noNum', { n: arg.n }) }; var bt = document.querySelector('#p' + i1 + ' .p-actions button.buyBtn') || buyBtnOf(i1); if (bt) bt.click(); return { say: say$('buy_n', { n: arg.n }) }; }
      case 'open_n': { var i2 = item(arg.n); if (i2 < 0) return { say: say$('noNum', { n: arg.n }) }; A.open(i2, true); return { say: say$('open_n', { n: arg.n }) }; }
      case 'desc_n': { var i3 = item(arg.n); if (i3 < 0) return { say: say$('noNum', { n: arg.n }) }; var db = descBtnOf(i3); if (db) db.click(); return { silent: true }; }
      // v30 DESCRIBE AND SHOW by voice: "show number 3" / "show it" — the card is scrolled into view and lit (big, black on yellow)
      case 'show_n': { var i4 = item(arg.n); if (i4 < 0) return { say: say$('noNum', { n: arg.n }) }; if (root.AIN_SHOW) AIN_SHOW.pick(i4, 'cmd'); return { say: say$('show_n', { n: arg.n }) }; }
      case 'show_cur': { var cs = root.AIN_SHOW && AIN_SHOW.showCurrent(); return { say: cs ? say$('show_cur') : say$('noShow') }; }
      case 'list_read': return { say: speakList() };
      case 'list_remove': {
        var a = CO.list(); if (!(arg.n >= 1 && arg.n <= a.length)) return { say: a.length ? say$('noNum', { n: arg.n }) : say$('noList') };
        var n = arg.n; return { ask: { q: say$('removeQ', { n: n }), run: function () { CO.removeFromList(n); return say$('removed', { n: n }); } } };
      }
      case 'again_n': { var h = H.all(); if (!(arg.n >= 1 && arg.n <= h.length)) return { say: say$('noNum', { n: arg.n }) }; var ab = document.querySelectorAll('#histBox button.histAgain')[arg.n - 1]; if (ab) ab.click(); return { say: say$('again_n', { n: arg.n }) }; }
      case 'forget_n': {
        var h2 = H.all(); if (!(arg.n >= 1 && arg.n <= h2.length)) return { say: say$('noNum', { n: arg.n }) };
        var n2 = arg.n; return { ask: { q: say$('forgetQ', { n: n2 }), run: function () { var x = H.forget(String(n2)); if (H.render) H.render(); return x ? A.t('histForgot', { name: x.name || x.title }) : ''; } } };
      }
      case 'hist_clear':
        if (!H.all().length) return { say: say$('noHist') };
        return { ask: { q: say$('histClearQ'), run: function () { H.clear(); if (H.render) H.render(); return A.t('histCleared'); } } };
      case 'hist_more': case 'hist_less': { var want = id === 'hist_more'; var mb = document.querySelector('#histBox button[aria-expanded]'); if (mb && (mb.getAttribute('aria-expanded') === 'true') !== want) mb.click(); return { say: say$(id) }; }
      case 'loc_forget': return { ask: { q: say$('locForgetQ'), run: function () { LO.forget(); if (LO.render) LO.render(); return A.t('locForgot'); } } };
      case 'loc_yes': { var y = $('locYes'); if (y) y.click(); return { silent: true }; }
      case 'loc_no': { var no = $('locNo'); if (no) no.click(); return { silent: true }; }
      case 'loc_later': { var lt = $('locLater'); if (lt) lt.click(); return { say: say$('loc_later') }; }
      case 'store_close': { var r = root.BAIN_STORES && BAIN_STORES.close(arg.store); return { say: r ? A.t('storeClosed', { store: arg.store }) : say$('notHere') }; }
      case 'stop': try { if (root.speechSynthesis) speechSynthesis.cancel(); } catch (e) {} return { say: '' };
      case 'next': case 'back': return { say: page(id) };
    }
    return null;
  }
  function buyBtnOf(i) { var li = $('p' + i); if (!li) return null; var bs = li.querySelectorAll('button'); var w = APP().t('buy'); for (var k = 0; k < bs.length; k++) if (bs[k].textContent === w) return bs[k]; return null; }
  function descBtnOf(i) { var li = $('p' + i); if (!li) return null; var bs = li.querySelectorAll('button'); var w = APP().t('describe'); for (var k = 0; k < bs.length; k++) if (bs[k].textContent === w) return bs[k]; return null; }
  function page(dir) {   // typed "next" / "back" outside a call: the next / previous 3 results, read by the phone voice
    var A = APP(), S = A.S, from;
    if (dir === 'next') { if (S.shown >= S.results.length) return say$('noNum', { n: S.results.length + 1 }); from = S.shown; S.shown = Math.min(S.results.length, from + 3); }
    else { from = Math.max(0, S.shown - 6); S.shown = from + 3; }
    var items = S.results.slice(from, from + 3);
    var li = $('p' + from); if (li) try { li.scrollIntoView({ block: 'start' }); } catch (e) {}
    return items.map(function (p, k) { return (from + k + 1) + '. ' + (A.shortName ? A.shortName(p) : p.title) + (p.price != null && root.BAIN_HIST && BAIN_HIST.money ? ', ' + BAIN_HIST.money(p.price, p.currency) : ''); }).join('. ');
  }
  // out loud + on screen. In a call the AI says the line (ai.js passes it on); otherwise the phone's own voice.
  function speak(line) {
    if (!line) return; var A = APP(); if (A) { A.status(line); A.announce(line); }
    if (root.BAIN_AI && BAIN_AI.active() && BAIN_AI.sayLine) { BAIN_AI.sayLine(line); return; }
    if (A && A.sayNative) A.sayNative(line);
  }
  // confirm through the Yes/No box (AIN_LEGAL.confirm). In a call the AI asks the question; the answer (voice or tap) runs it.
  function ask(q, fn, how) {
    var L = root.AIN_LEGAL; if (!L || !L.confirm) return;
    var inCall = how === 'call' || (root.BAIN_AI && BAIN_AI.active());
    L.confirm({ lang: cur(), q: q, yes: say$('yesBtn'), no: say$('noBtn'), hint: say$('sayYesNo'), voice: say$('voiceBtn'), speakQ: !inCall,
      onYes: function () { var line = ''; try { line = fn() || ''; } catch (e) {} if (line) speak(line); },
      onNo: function () { speak(say$('kept')); } });
  }
  // the typed box (not in a call): true when it was a command
  function typed(text) {
    var m = match(text, 'typed'); if (!m) return false; LAST = { id: m.id, arg: m.arg, how: 'typed' };
    var r = run(m, 'typed'); if (!r) return false;
    if (r.ask) { ask(r.ask.q, r.ask.run, 'typed'); return true; }
    if (r.say) speak(r.say);
    return true;
  }
  var LAST = null;
  root.AIN_VCMD = { match: match, readings: readings, run: run, typed: typed, yesNo: yesNo, helpText: helpText, helpIds: helpIds, screen: screen, ask: ask, speak: speak, say: say$,
    phrase: phrase, avail: avail, AI_IN_CALL: AI_IN_CALL, last: function () { return LAST; }, _setLast: function (x) { LAST = x; }, compile: compile };
})(typeof window !== 'undefined' ? window : globalThis);
