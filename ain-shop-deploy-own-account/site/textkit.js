/* AIN Shop — small text helpers shared by the screen (app.js) and the voice (ai.js); also loaded by the Node tests.
   shortName: a product's spoken-friendly name (brand + what it is + one key detail) instead of the store's long SEO title.
   langOf:    which language a typed or transcribed sentence is in (Latin-script languages told apart by their own words/letters).
   parseTyped: a typed search ("grey couch under 500") as a search query with a budget, without the AI. */
(function (root) {
  'use strict';
  function clean(s) { return String(s == null ? '' : s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/[\u200B-\u200F\u202A-\u202E]/g, '').replace(/\s+/g, ' ').trim(); }
  // marketing / SEO filler that says nothing about the product when heard
  var FILLER = [
    /\b(?:for|fits)\s+(?:men|women|man|woman|adults?)\s*(?:&|and|or|\/)\s*(?:men|women|man|woman|adults?|kids|teens)\b/gi,
    /\b(?:under|below|less than)\s*\$\s*\d+(?:\.\d+)?\b/gi, /\$\s*\d+(?:\.\d+)?\s*(?:or less|and under)\b/gi,
    /\b(?:new|newest|latest|upgraded|updated|hot|sale|hot sale|best seller|bestseller|best selling|premium|high quality|top rated|top quality|free shipping|fast shipping|limited edition|official|genuine|authentic|brand new|perfect gift|gift idea|ideal gift|great gift|gifts? for \w+)\b/gi,
    /\b(?:19|20)\d{2}\b(?!\s*(?:lumens|w\b|watts|mah))/g, /\b(?:unisex|lightweight|durable|portable)\b/gi
  ];
  var STOP_END = /\s+(?:for|with|and|or|the|a|an|of|in|on|to|by|&|\+|-|–|—|,|\/)$/i;
  var UNIT = /(?:^|[\s(,])(\+?\d+(?:[.,]\d+)?\s?(?:"|”|''|-?in(?:ch(?:es)?)?\b|-?ft\b|-?oz\b|fl\.? ?oz\b|ml\b|l\b|liters?\b|qt\b|quarts?\b|lbs?\b|kg\b|g\b|cm\b|mm\b|-?inch\b|w\b|watts?\b|mah\b|gb\b|tb\b|-?pack\b|-?count\b|ct\b|pcs?\b|pieces?\b|-?piece\b|-?seat(?:er)?\b|cups?\b))/i;
  function titleCase(s) { return s.toLowerCase().replace(/(^|[\s\-\/])(\p{L})/gu, function (m, a, b) { return a + b.toUpperCase(); }); }
  function words(s) { return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(function (w) { return w.length > 2; }); }
  function fallbackShort(title, brand, maxWords) {
    var full = clean(title); if (!full) return '';
    maxWords = maxWords || 7;
    var s = full;
    if (s.length > 12 && s === s.toUpperCase() && /[A-Z]/.test(s)) s = titleCase(s);
    s = s.replace(/\s*[\[\{][^\]\}]*[\]\}]\s*/g, ' ');                                   // [2024 Upgraded] …
    s = s.replace(/\s*\(([^)]*)\)\s*/g, function (m, x) { return /\d/.test(x) && x.length <= 24 && !/\b(?:19|20)\d\d\b/.test(x) ? ' (' + x + ') ' : ' '; });   // keeps (2nd Generation), (Pack of 2)
    var detail = (full.match(UNIT) || [])[1] || '';
    if (!detail && /\b(?:reading glasses|readers|reading eyeglasses)\b/i.test(full)) { var m = full.match(/(?:^|\s)\+?([0-4](?:\.\d{1,2})?)\s*(?:x\b|$|\s)/); if (m && parseFloat(m[1]) > 0) detail = '+' + m[1]; }
    var segs = s.split(/\s+[-–—|•·:]\s+|\s*[|•]\s*|,\s+|\s+\/\s+/).map(function (x) { return x.trim(); }).filter(Boolean);
    var core = segs[0] || s;
    if (core.split(' ').length < 3 && segs[1]) core = core + ' ' + segs[1];
    var cw = core.split(/\s+with\s+/i); if (cw.length > 1 && cw[0].split(' ').length >= 3) core = cw[0];   // "… with Silver & Black Metal Case": features after "with" are not the name
    FILLER.forEach(function (re) { core = core.replace(re, ' '); });
    core = core.replace(/\s+/g, ' ').trim();
    var ws = core.split(' ');
    if (ws.length > maxWords) core = ws.slice(0, maxWords).join(' ');
    var guard = 0; while (STOP_END.test(core) && guard++ < 5) core = core.replace(STOP_END, '');
    core = core.replace(/[\s,;:\-–—]+$/, '');
    if (brand) { var b = clean(brand); if (b && b.length < 40 && core.toLowerCase().indexOf(b.toLowerCase()) < 0 && !/^(unbranded|generic|n\/a|none)$/i.test(b)) core = b + ' ' + core; }
    if (detail) { var d = detail.replace(/\s+/g, ' ').trim(); if (core.toLowerCase().indexOf(d.toLowerCase().replace(/^\+/, '')) < 0) core += ', ' + d; }
    return core || full.slice(0, 60);
  }
  // the search's own short name is used when it really names this product (shares a word with the title or the brand)
  function shortName(p, maxWords) {
    p = p || {};
    var title = clean(p.title), sh = clean(p.short || p.short_name);
    if (sh && sh.length <= 70 && sh.length >= 3) {
      // trusted only when it clearly names the product on the store's page: its first word (the brand) is in the title or brand,
      // and at least half of its words are too (measured Oct 27: a search once named a different brand than the page it linked)
      var tw = {}; words(title + ' ' + (p.brand || '')).forEach(function (w) { tw[w] = 1; });
      var sw = words(sh), hit = sw.filter(function (w) { return tw[w]; }).length;
      if (!title || (sw.length && tw[sw[0]] && hit * 2 >= sw.length)) return sh;
    }
    var out = fallbackShort(title, p.brand, maxWords);
    return out.length > 80 ? out.slice(0, 77).replace(/\s+\S*$/, '') + '…' : out;
  }

  // ---------------- language of a sentence ----------------
  // words that mostly belong to one language (words shared by two languages are left out or listed in both)
  // words that mostly belong to one language (words two languages share are listed in both or left out); matched as whole words
  var LAT = {
    English: 'the|what|does|is|are|i|want|to|buy|find|show|for|under|near|how|much|which|one|it|open|compare|more|and|an|please|can|you|this|that|look|like|second|first|third|cheaper|best|need|looking|with|get|of|my',
    Spanish: 'qué|el|los|las|quiero|busca|busco|buscar|cuánto|cuanto|cuesta|dónde|cómo|favor|esta|necesito|barato|baratos|más|muéstrame|dame|tienda|gafas|lentes|zapatos|y|pero|también|hay|tiene|precio|segundo|primero|mejor|del|al|unos|unas|lo|muy|ahora|gracias|hola|puedes|usted|con|en',
    Portuguese: 'quero|você|voce|vocês|não|nao|obrigado|obrigada|onde|quanto|preço|preco|isso|esse|essa|uma|um|procuro|procurar|mostre|mostra|tem|até|barato|melhor|óculos|oculos|com|do|da|das|na|ao|são|é|eu|meu|minha|também|tambem|loja|sapato|sapatos|segundo|primeiro|mais|olá|ola|pode|agora|muito|preciso|comprar|gostaria|leitura',
    French: 'le|les|je|veux|acheter|cherche|combien|où|comment|est|ce|cette|des|du|une|pour|avec|moi|lunettes|chaussures|moins|merci|bonjour|voudrais|magasin|prix|deuxième|premier|meilleur|et|pas|vous|tu|il|elle',
    German: 'was|der|die|das|ich|will|möchte|kaufen|suche|wie|viel|wo|für|ist|bitte|und|ein|eine|einen|mit|unter|brille|schuhe|zeig|zeige|mir|kostet|billig|günstig|danke|hallo|nicht|auch|zweite|erste|beste|laden|geschäft|euro|dollar',
    Italian: 'voglio|cerco|comprare|quanto|costa|dove|come|per|favore|il|gli|della|del|di|uno|una|con|occhiali|scarpe|grazie|ciao|prezzo|negozio|vorrei|sono|meno|mostrami|economico|migliore|anche|non|è',
    Dutch: 'ik|wil|kopen|zoek|hoeveel|kost|waar|hoe|voor|alstublieft|het|een|van|met|bril|schoenen|bedankt|dank|winkel|prijs|graag|niet|ook|goedkoop|beste|laat|zien|onder',
    Polish: 'chcę|chce|kupić|kupic|szukam|ile|kosztuje|gdzie|jak|dla|proszę|prosze|jest|okulary|buty|dziękuję|dziekuje|sklep|cena|tani|tanie|najlepszy|pokaż|pokaz|nie|też|poniżej|za',
    Swedish: 'jag|vill|köpa|söker|hur|mycket|kostar|var|för|tack|och|ett|med|glasögon|skor|butik|pris|billig|bästa|visa|mig|inte|också',
    Turkish: 'istiyorum|almak|arıyorum|ne|kadar|nerede|nasıl|için|lütfen|bir|ve|ile|gözlük|ayakkabı|teşekkürler|mağaza|fiyat|ucuz|iyi|göster|bana|değil|altında',
    Indonesian: 'saya|mau|ingin|beli|membeli|cari|mencari|berapa|harga|di|mana|untuk|tolong|yang|dan|dengan|kacamata|sepatu|terima|kasih|toko|murah|terbaik|tunjukkan|tidak|juga|bawah'
  };
  Object.keys(LAT).forEach(function (k) { var o = {}; LAT[k].split('|').forEach(function (w) { o[w] = 1; }); LAT[k] = o; });
  var HINTS = [ ['Portuguese', /[ãõ]|ção\b|ções\b|\blh|nh[aeiou]/gi, 2], ['Spanish', /[ñ¿¡]|ción\b|ciones\b/gi, 2], ['German', /[äöüß]|sch/gi, 1.5], ['French', /[èêëàâîïôûœ]|\bqu'|\bj'|\bc'/gi, 1.5],
    ['Polish', /[ąćęłńśźż]/gi, 2.5], ['Turkish', /[ğışİ]/g, 2.5], ['Swedish', /[å]/gi, 1.5], ['Italian', /zion[ei]\b|gli\b|\bchi\b/gi, 1] ];
  var SCRIPTS = [
    ['Greek', /[\u0370-\u03FF]/g], ['Amharic', /[\u1200-\u137F]/g], ['Thai', /[\u0E00-\u0E7F]/g], ['Korean', /[\uAC00-\uD7AF\u1100-\u11FF]/g],
    ['Japanese', /[\u3040-\u30FF]/g], ['Chinese', /[\u4E00-\u9FFF]/g], ['Bengali', /[\u0980-\u09FF]/g], ['Punjabi', /[\u0A00-\u0A7F]/g],
    ['Gujarati', /[\u0A80-\u0AFF]/g], ['Tamil', /[\u0B80-\u0BFF]/g], ['Telugu', /[\u0C00-\u0C7F]/g], ['Devanagari', /[\u0900-\u097F]/g]
  ];
  function count(re, s) { re.lastIndex = 0; return (s.match(re) || []).length; }
  // screen: the app's screen language as its English name ("Portuguese"); screenCode: its code ("pt", "zh-TW", "mr")
  function langOf(text, screen, screenCode) {
    var s = String(text || ''), heb = count(/[\u05D0-\u05EA]/g, s), lat = count(/[A-Za-z\u00C0-\u024F]/g, s), cyr = count(/[\u0400-\u04FF]/g, s), ara = count(/[\u0600-\u06FF]/g, s), top = Math.max(heb, lat, cyr, ara);
    var other = null, on = 0; SCRIPTS.forEach(function (x) { var n = count(x[1], s); if (n > on) { on = n; other = x[0]; } });
    if (on > top && on >= 1) {
      if (other === 'Chinese' && count(/[\u3040-\u30FF]/g, s)) return 'Japanese';
      if (other === 'Chinese') return screen === 'Japanese' ? 'Japanese' : screenCode === 'zh-TW' ? 'Chinese (Traditional, Mandarin)' : 'Chinese (Mandarin)';
      if (other === 'Devanagari') return screenCode === 'mr' ? 'Marathi' : 'Hindi';
      return other;
    }
    if (top < 2) return null;
    if (top === heb) return /(^|\s)(איך|וואס|וואָס|איז|נישט|ניט|דער|פאר|פֿאַר|מיר|ווי|אַ|דאָס|וויפֿל|קויפֿן)(\s|$)/.test(s) || /[ײױװ]|אָ|אַ/.test(s) || screen === 'Yiddish' ? 'Yiddish' : 'Hebrew';
    if (top === cyr) return /[іїєґ]/i.test(s) ? 'Ukrainian' : /[ђћџљњј]/i.test(s) ? 'Serbian' : /[ъ]/.test(s) && !/[ыэё]/.test(s) ? 'Bulgarian' : (screen === 'Ukrainian' || screen === 'Serbian' || screen === 'Bulgarian') && !/[ыэё]/.test(s) ? screen : 'Russian';
    if (top === ara) return /[ٹڈڑںےھ]/.test(s) ? 'Urdu' : /[پچژگ]/.test(s) || (/[کی]/.test(s) && !/[يك]/.test(s)) ? 'Persian' : (screen === 'Urdu' || screen === 'Persian') ? screen : 'Arabic';
    var toks = s.toLowerCase().split(/[^\p{L}\p{M}\p{N}']+/u).filter(Boolean), sc = {};
    Object.keys(LAT).forEach(function (k) { var n = 0, o = LAT[k]; toks.forEach(function (w) { if (o[w] === 1) n++; }); sc[k] = n; });
    HINTS.forEach(function (h) { sc[h[0]] += Math.min(3, count(h[1], s)) * h[2]; });
    var keys = Object.keys(sc).sort(function (a, b) { return sc[b] - sc[a]; }), best = keys[0], bn = sc[best], second = sc[keys[1]];
    if (!bn) return null;
    if (screen && sc[screen] != null && sc[screen] >= bn - 0.5 && sc[screen] > 0) return screen;   // a tie goes to the screen's language
    if (bn - second < 1) return null;                                                               // unclear: the AI hears the voice itself
    if (bn < 2 && best !== screen) return null;                                                      // one word is not enough to switch language
    return best;
  }

  // ---------------- a typed search, without the AI ----------------
  function num(x) { var n = parseFloat(String(x).replace(/,/g, '')); return isFinite(n) && n > 0 ? n : null; }
  function parseTyped(text) {
    var q = clean(text), out = { query: q };
    var m = q.match(/\s*(?:\b(?:under|below|less than|max(?:imum)?|up to|no more than|cheaper than|unter|bis|moins de|jusqu'à|menos de|até|hasta|sotto|onder|poniżej)\s*|<\s*)(?:\$|€|£|usd\s*)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:\$|€|£|dollars?|bucks|usd|euros?|dólares|dolares|dollar|reais|pesos|shekels?|₪)?/i);
    if (m) { out.max_price = num(m[1]); q = q.replace(m[0], ' '); }
    var n = q.match(/\s*(?:\b(?:over|above|more than|at least|min(?:imum)?|from|über|ab|plus de|más de|mais de)\s*|>\s*)(?:\$|€|£)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:\$|€|£|dollars?|bucks|usd|euros?)?/i);
    if (n) { out.min_price = num(n[1]); q = q.replace(n[0], ' '); }
    var st = q.match(/\s+(?:at|from|on|only at|only on)\s+(walmart|target|amazon|best buy|bestbuy|ikea|wayfair|home depot|homedepot|lowe'?s|costco|macy'?s|kohl'?s|ebay|etsy)\s*$/i);
    if (st) { out.stores = [st[1]]; q = q.replace(st[0], ' '); }
    q = q.replace(/^\s*(?:i\s+(?:want|need)(?:\s+to\s+buy)?|find(?:\s+me)?|search(?:\s+for)?|show\s+me|looking\s+for|buy)\s+/i, '').replace(/\s+/g, ' ').trim();
    out.query = q || clean(text);
    return out;
  }
  var api = { shortName: shortName, fallbackShort: fallbackShort, langOf: langOf, parseTyped: parseTyped, clean: clean };
  root.AIN_TEXT = api;
})(typeof window !== 'undefined' ? window : globalThis);
