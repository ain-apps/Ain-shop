/* AIN Shop v19 — forgiving understanding (BAIN_INTENT). Shared by typed commands and the voice call.
   normalize(): lower case, no accents / Hebrew points / Yiddish vowel marks, punctuation → spaces, one space.
   fix(): only whole phrases that speech-to-text is known to mishear in a shopping app ("my cards" → "my carts", "wall mart" →
   "walmart", "add to card" → "add to cart"); a search for "gift cards" is never touched.
   hit(): a command phrase found in the words — exactly, or forgivingly (one letter off in a longer word, a cut-off word,
   filler words between), in the phrase's own word order.
   noise(): an empty / silent / beep recording, or the stock words speech-to-text invents for silence → no action at all. */
(function (root) {
  'use strict';
  function normalize(s) {
    s = String(s == null ? '' : s).toLowerCase();
    try { s = s.normalize('NFKD'); } catch (e) {}
    s = s.replace(/[\u0300-\u036f]/g, '')            // Latin accents
      .replace(/[\u0591-\u05c7]/g, '')               // Hebrew points, Yiddish komets / pasekh, cantillation
      .replace(/\u05f0/g, '\u05d5\u05d5').replace(/\u05f1/g, '\u05d5\u05d9').replace(/\u05f2/g, '\u05d9\u05d9')   // Yiddish ligatures װ ױ ײ → two letters
      .replace(/[\u064b-\u065f\u0670]/g, '')         // Arabic harakat
      .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .replace(/[’'`´]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }
  // whole-phrase mishearings (left side matched on word edges, after normalize)
  var FIX = [
    [/\b(my|all my|all of my|the|our|both|read|read my|show my|show me my|check my|whats in my|what s in my) (cards|cars|charts|carts?s|kurts|courts)\b/g, '$1 carts'],
    [/\b(my|the|this|that|our|to|in|into|from|to my|in my|from my|walmart|target|amazon) (card|car|chart|kart|cot|court|curt)\b(?! (number|reader|game|games|holder|seat|wash|charger|mount|battery))/g, '$1 cart'],
    [/\b(add|put|place|move)( it| this| that| them| one)? (to|in|into) (the |my )?(card|car|chart|kart|cot)\b/g, '$1$2 $3 $4cart'],
    [/\bcheck ?out\b|\bchuck out\b|\bcheckouts\b|\bcheque out\b/g, 'checkout'],
    [/\b(wall|wal|wol|whole|wool|walt) ?(mart|marts|mark|marked|mart s)\b|\bwalmark\b|\bwallmart\b|\bwalmarts\b|\bwol mart\b/g, 'walmart'],
    [/\btar ?(get|jet|gay|ge)\b|\btarge\b|\btargets\b(?= (cart|carts|store|now|please|$))/g, 'target'],
    [/\bbest (by|bye|bi|bai)\b|\bbestbuy\b/g, 'best buy'],
    [/\bama ?zon s?\b|\bamazons\b|\bamazing store\b/g, 'amazon'],
    [/\bcost ?co\b|\bcostcos\b|\bcost go\b/g, 'costco'],
    [/\bhome depo\b|\bhome deep oh\b|\bhome debt oh\b/g, 'home depot'],
    [/\bkro ?ger\b|\bkruger\b|\bkroeger\b/g, 'kroger'],
    [/\bwal ?greens\b|\bwall greens\b/g, 'walgreens'],
    [/\bmy ?er\b|\bmeyer\b|\bmeier\b/g, 'meijer'],
    [/\bgo too\b|\bgo two\b|\bgoal to\b/g, 'go to'],
    [/\bswitch two\b|\bswitched to\b|\bswish to\b/g, 'switch to']
  ];
  function fix(s) { var t = normalize(s); FIX.forEach(function (f) { t = t.replace(f[0], f[1]); }); return t.replace(/\s+/g, ' ').trim(); }
  function lev(a, b, max) {
    if (a === b) return 0; max = max == null ? 2 : max; if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur, i, j; for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) { cur = [i]; var lo = i;
      for (j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < lo) lo = cur[j]; }
      if (lo > max) return max + 1; prev = cur; }
    return prev[b.length];
  }
  var SPACELESS = /[\u0e00-\u0e7f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u1000-\u109f\u1780-\u17ff]/;   // Thai, Japanese, Chinese, Korean, Burmese, Khmer: substring only
  function wordLike(a, b) {   // a = a word that was said / typed, b = the phrase's word
    if (a === b) return true;
    var n = Math.min(a.length, b.length);
    if (n >= 4 && lev(a, b, n >= 8 ? 2 : 1) <= (n >= 8 ? 2 : 1)) return true;           // one letter off ("chekout", "carst")
    if (n === 3 && Math.max(a.length, b.length) >= 4 && lev(a, b, 1) <= 1 && a[0] === b[0]) return true;   // "bak" for "back"           // one letter off ("chekout", "carst", "קניות"/"קנייות")
    if (a.length >= 4 && b.length > a.length && b.indexOf(a) === 0 && a.length >= b.length * 0.6) return true;   // a word cut off ("walm" … no: 4 of 7; "chec" no; "checko" yes)
    if (b.length >= 4 && a.length > b.length && a.indexOf(b) === 0 && a.length - b.length <= 2) return true;      // plural / suffix ("carts" for "cart")
    return false;
  }
  // one phrase in the words: exact substring, else every word of the phrase in order, at most 2 other words between
  function phraseIn(text, phrase) {
    var t = normalize(text), p = normalize(phrase); if (!t || !p) return 0;
    if ((' ' + t + ' ').indexOf(' ' + p + ' ') >= 0) return 3;
    if (t.indexOf(p) >= 0 && (SPACELESS.test(p) || p.length >= 4)) return 2;
    if (SPACELESS.test(p)) return 0;
    var tw = t.split(' '), pw = p.split(' '); if (pw.length > tw.length) return 0;
    var strong = pw.filter(function (w) { return w.length >= 3; }).length; if (!strong) return 0;
    for (var s = 0; s < tw.length; s++) {
      var i = s, k = 0, gaps = 0;
      while (k < pw.length && i < tw.length) {
        if (wordLike(tw[i], pw[k])) { k++; i++; }
        else if (k > 0 && gaps < 2) { gaps++; i++; }
        else break;
      }
      if (k === pw.length) return 1;
    }
    return 0;
  }
  // the best phrase of a list found in the words: { phrase, how: 3 exact word match | 2 inside a word | 1 forgiving }
  // a forgiving (how 1) match needs a phrase of 2+ words and a short sentence around it, so "black shoes" never means "back"
  function hit(text, phrases) {
    var best = null, t = fix(text), nw = t ? t.split(' ').length : 0;
    (phrases || []).forEach(function (p) {
      var h = Math.max(phraseIn(t, p), phraseIn(text, p));
      if (h === 1) { var pw = normalize(p).split(' ').length; if (pw < 2 || nw > pw + 4) h = 0; }
      if (h && (!best || h > best.how || (h === best.how && p.length > best.phrase.length))) best = { phrase: p, how: h };
    });
    return best;
  }
  // "swich to walmart" → { phrase: 'switch to', rest: 'walmart' }: a phrase (2+ words) said forgivingly at the start
  function lead(text, phrases) {
    var tw = fix(text).split(' '), best = null;
    (phrases || []).forEach(function (p) {
      var pw = normalize(p).split(' '); if (pw.length < 2 || tw.length <= pw.length) return;
      for (var k = 0; k < pw.length; k++) if (!wordLike(tw[k], pw[k])) return;
      if (!best || pw.length > best.n) best = { phrase: p, rest: tw.slice(pw.length).join(' '), n: pw.length };
    });
    return best;
  }
  // what speech-to-text writes for silence, a beep or room noise (it invents these from nothing)
  var STOCK = ['you', 'thank you', 'thanks', 'thank you very much', 'thanks for watching', 'thank you for watching', 'please subscribe', 'subscribe',
    'bye', 'bye bye', 'goodbye', 'okay', 'ok', 'oh', 'uh', 'um', 'umm', 'hmm', 'mm', 'mmm', 'ah', 'eh', 'huh', 'hm', 'beep', 'music', 'applause', 'silence', 'noise', 'laughter',
    'so', 'the', 'and', 'i', 'a', 'yeah', 'shh', 'sh', 'achoo', 'atchoo', 'ah choo', 'hachoo', 'bless you', 'cough', 'coughing', 'coughs', 'sneeze', 'sneezing', 'ahem', 'ugh', 'oh my', 'whoa', 'wow',   // v20: sounds written as words
    'subtitles by the amara org community', 'amara org',
    'תודה', 'תודה רבה', 'שלום', 'אה', 'אמ', 'ביי', 'תודה שצפיתם', 'א דאנק', 'דאנקע',
    'спасибо', 'продолжение следует', 'субтитры', 'merci', 'sous titres', 'untertitel', 'danke', 'gracias', 'obrigado', 'grazie',
    'ご視聴ありがとうございました', 'ありがとうございました', '谢谢', '謝謝', '字幕', '감사합니다', 'شكرا', 'اشتراک'];
  var STOCKSET = {}; STOCK.forEach(function (w) { STOCKSET[normalize(w)] = 1; });
  // speechMs: how long the voice detector heard speech (unknown = null)
  function noise(text, speechMs) {
    var t = normalize(text);
    if (!t) return true;                                    // nothing written down / only dots, beeps, symbols
    if (!/[\p{L}\p{N}]/u.test(t)) return true;
    if (/^(\S)\1*$/.test(t.replace(/ /g, '')) && t.length < 6) return true;   // "mmmm", "...."
    if (STOCKSET[t] && (speechMs == null || speechMs < 1600)) return true;   // a stock phrase on a short sound
    if (/subtitles|amara|transcribed by|captions by|untertitel|sous titres|субтитр/.test(t)) return true;
    return false;
  }
  // v24 (Nati, Nov 1: "short commands working instantly"): a SHORT command said on its own → 'stop' | 'next' | 'back', else null.
  // The whole utterance must be the command (plus polite filler), so "stop and shop", "next to the milk" or "back pain cream" are never one.
  var QFILL = /^(?:(?:ok|okay|please|now|hey|ain|ain shop|just|so|and|oh|um|uh|בבקשה|אנא|עכשיו|טוב|נו|אוקיי|רק)\s+)+|(?:\s+(?:please|now|thanks|thank you|ok|okay|בבקשה|עכשיו|תודה))+$/g;
  var QUICK = {
    stop: ['stop', 'stop it', 'stop talking', 'stop stop', 'pause', 'quiet', 'be quiet', 'silence', 'shh', 'shhh', 'shush', 'hush', 'enough', 'thats enough', 'wait', 'hold on', 'mute',
      'עצור', 'עצרי', 'תעצור', 'תעצרי', 'עצור עצור', 'הפסק', 'תפסיק', 'הפסיקי', 'תפסיקי', 'די', 'די די', 'שקט', 'רגע', 'חכה', 'חכי', 'סטופ', 'שטיל', 'הער אויף'],
    next: ['next', 'next one', 'next ones', 'next three', 'the next ones', 'the next three', 'more', 'more results', 'show more', 'show me more', 'next results',
      'הבא', 'הבאה', 'הבאים', 'עוד', 'עוד תוצאות', 'תראה עוד', 'הלאה', 'ווייטער', 'נעקסט'],
    back: ['back', 'go back', 'previous', 'previous ones', 'the previous ones', 'previous three', 'the previous three', 'previous results',
      'הקודם', 'הקודמים', 'הקודמת', 'חזור', 'תחזור', 'אחורה', 'חזרה', 'צוריק']
  };
  var QSET = {}; Object.keys(QUICK).forEach(function (k) { QUICK[k].forEach(function (w) { QSET[normalize(w)] = k; }); });
  function quick(text) {
    var t = normalize(text); if (!t || t.length > 40) return null;
    var u = (t.replace(QFILL, '').trim() || t).split(' ').filter(function (w, i, a) { return w !== a[i - 1]; }).join(' ');   // "stop stop stop" = "stop"
    return QSET[u] || null;
  }
  // v26 (Nati, Nov 1 12:23 AM: "make these by voice also"): the Response speed setting by voice → 'fast' | 'normal' | 'slow' | 'ask' | null.
  // Whole utterance only (plus polite filler), so "fast shipping", "slow cooker" or "faster delivery" are never one. strict (in a voice call): a bare
  // "normal" / "רגיל" is not taken (it is a common answer to the AI's own questions, "regular or diet?"), "normal speed" is.
  var SPEED = {
    fast: ['faster', 'talk faster', 'respond faster', 'answer faster', 'be faster', 'go faster', 'reply faster', 'respond quicker', 'answer quicker', 'quicker', 'speed up', 'fast speed', 'speed fast', 'set speed to fast', 'make it faster',
      'מהר יותר', 'יותר מהר', 'תענה מהר יותר', 'תעני מהר יותר', 'תדבר מהר יותר', 'מהירות מהירה', 'מהיר יותר'],
    normal: ['normal speed', 'speed normal', 'regular speed', 'default speed', 'set speed to normal', 'back to normal speed', 'normal response speed', 'מהירות רגילה', 'מהירות רגיל'],
    slow: ['slower', 'wait longer', 'slow down', 'give me more time', 'talk slower', 'respond slower', 'answer slower', 'be slower', 'slow speed', 'speed slow', 'set speed to slow', 'wait more', 'more time',
      'לאט יותר', 'יותר לאט', 'חכה יותר', 'חכי יותר', 'תחכה יותר', 'תחכי יותר', 'תן לי יותר זמן', 'תני לי יותר זמן', 'מהירות איטית'],
    ask: ['whats my speed', 'what is my speed', 'what speed', 'what speed is it', 'which speed', 'whats the speed', 'what is the speed', 'my speed', 'what is my response speed', 'whats my response speed', 'what is the response speed', 'response speed', 'speed',
      'מה המהירות', 'מה המהירות שלי', 'איזו מהירות', 'מה מהירות התגובה', 'מהירות התגובה', 'מהירות']
  };
  var LOOSE = { normal: ['normal', 'רגיל'] };
  var SPSET = {}, SPLOOSE = {}; Object.keys(SPEED).forEach(function (k) { SPEED[k].forEach(function (w) { SPSET[normalize(w)] = k; }); });
  Object.keys(LOOSE).forEach(function (k) { LOOSE[k].forEach(function (w) { SPLOOSE[normalize(w)] = k; }); });
  function speed(text, strict) {
    var t = normalize(text); if (!t || t.length > 48) return null;
    var u = (t.replace(QFILL, '').trim() || t);
    var hitv = SPSET[u] || (!strict && SPLOOSE[u]) || null; if (hitv) return hitv;
    // v28: the same four commands in the app's other languages (Yiddish "שנעלער", French "plus vite"…) — whole sentence, from vcmd-i18n.js
    var V = root.AIN_VCMD; if (!V || !V.readings) return null;
    var rs = V.readings(text);
    for (var i = 0; i < rs.length; i++) { var m = /^speed_(fast|normal|slow|ask)$/.exec(rs[i].id); if (!m) continue; if (strict && m[1] === 'normal' && u.split(' ').length < 2) continue; return m[1]; }
    return null;
  }
  var api = { normalize: normalize, fix: fix, hit: hit, lead: lead, phraseIn: phraseIn, lev: lev, noise: noise, wordLike: wordLike, quick: quick, speed: speed };
  root.BAIN_INTENT = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
