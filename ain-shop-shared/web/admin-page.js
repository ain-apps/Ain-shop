/* AIN Shop – admin page script (moved out of the page so inline scripts can be refused by the security policy) */
(function () {
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function api(p, body) { return fetch('/api/owner/' + p, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}).then(function (r) { return r.json().then(function (j) { j._s = r.status; return j; }); }); }
  var LBL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
  function load() {
    api('stores').then(function (j) {
      if (j._s === 401) { $('login').hidden = false; $('panel').hidden = true; $('pin').focus(); return; }
      $('login').hidden = true; $('panel').hidden = false;
      var s = j.stores || [], c = { pending: 0, approved: 0, rejected: 0 }; s.forEach(function (x) { c[x.status] = (c[x.status] || 0) + 1; });
      $('counts').textContent = s.length + ' stores: ' + c.pending + ' pending, ' + c.approved + ' approved, ' + c.rejected + ' rejected';
      $('stores').innerHTML = s.length ? s.map(function (x) {
        return '<div class="store"><h3>' + esc(x.name) + '</h3><div>Status: <span class="st ' + esc(x.status) + '">' + LBL[x.status] + '</span> · ' + new Date(x.created).toLocaleString() + ' · ' + esc(x.lang) + '</div>' +
          '<div><a href="' + esc(x.website) + '" target="_blank" rel="noopener">' + esc(x.website) + '</a></div><div>' + esc(x.email) + '</div>' +
          (x.feed ? '<div>Feed: <a href="' + esc(x.feed) + '" target="_blank" rel="noopener">' + esc(x.feed) + '</a></div>' : '') + (x.note ? '<div>Note: ' + esc(x.note) + '</div>' : '') +
          '<div class="row">' + ['approved', 'rejected', 'pending'].map(function (st) { return '<button type="button" class="small" data-id="' + x.id + '" data-st="' + st + '" aria-pressed="' + (x.status === st) + '" aria-label="' + (st === 'approved' ? 'Approve' : st === 'rejected' ? 'Reject' : 'Set pending') + ' ' + esc(x.name) + '">' + (st === 'approved' ? 'Approve' : st === 'rejected' ? 'Reject' : 'Pending') + '</button>'; }).join('') + '</div></div>';
      }).join('') : '<p>No stores yet.</p>';
    });
    api('usage').then(function (j) { var v = j.visitors; if (v) { var pl = Object.keys(v.by_platform || {}).map(function (k) { return k + ' ' + v.by_platform[k]; }).join(', ');
      $('visitors').textContent = 'Today ' + v.today + ' (' + v.today_new + ' new, ' + v.today_returning + ' returning) · last 7 days ' + v.week + ' · all time ' + v.all_time + (pl ? ' · 14 days by device: ' + pl : '') + ' · test runs (not counted): ' + v.test_hits;
      $('vdays').innerHTML = v.by_day.slice().reverse().map(function (d) { return '<tr><td>' + d.day + '</td><td>' + d.devices + '</td><td>' + d.new + '</td><td>' + d.returning + '</td></tr>'; }).join(''); }
      var s = j.subscriptions; if (s) $('subs').textContent = 'Payments switch: ' + (s.on ? 'ON' : 'OFF (nobody is charged or blocked)') + ' · price $' + (s.price_cents / 100).toFixed(2) + ' ' + s.currency + '/month after a ' + s.trial_days + '-day free trial · payment processor: ' + (s.providers_connected && s.providers_connected.length ? s.providers_connected.join(', ') : 'none connected yet') + ' · subscribers ' + s.subscribers + ' · canceled (still on) ' + s.canceled_still_on + ' · in free trial ' + s.trials_active + ' · trial ended ' + s.trials_ended + ' · devices ' + s.devices;
      if (j.days) $('usage').innerHTML = j.days.map(function (d) { return '<tr><td>' + d.day + '</td><td>' + d.sessions + '</td><td>' + d.minutes + '</td><td>' + d.ai_cents + '</td><td>' + d.shop_cents + '</td></tr>'; }).join('');
      var u = j.usage; if (u) {   // v36: owner usage page — counts only, no names
        $('usageDays').innerHTML = (u.by_day || []).map(function (d) { return '<tr><td>' + esc(d.day) + '</td><td>' + d.searches + '</td><td>' + d.barcodes + '</td></tr>'; }).join('');
        $('topQueries').innerHTML = (u.top_queries || []).length ? u.top_queries.map(function (q) { return '<li>' + esc(q.words) + ' — ' + q.count + '</li>'; }).join('') : '<li>Nothing searched yet.</li>';
        $('topBuys').innerHTML = (u.top_buys || []).length ? u.top_buys.map(function (q) { return '<li>' + esc(q.words) + ' — ' + q.count + '</li>'; }).join('') : '<li>No buy button tapped yet.</li>';
        $('usageLangs').innerHTML = (u.by_lang || []).length ? u.by_lang.map(function (l) { return '<li>' + esc(l.lang) + ' — ' + l.devices + ' devices</li>'; }).join('') : '<li>No language data yet.</li>';
        if (u.note) $('usageNote').textContent = u.note;
        var sp = usageSpeech(u, v, s);   // the spoken version, built fresh each load
        $('usageSpeak').onclick = function () { speakUsage(sp); };
      } });
  }
  // v36: the owner hears the numbers spoken, not just seen — plain words, counts only
  function usageSpeech(u, v, s) {
    var parts = [];
    if (v) parts.push('Today, ' + v.today + ' visitors, ' + v.today_new + ' new and ' + v.today_returning + ' returning. Last 7 days, ' + v.week + ' visitors. All time, ' + v.all_time + '.');
    var tot = (u.by_day || []).reduce(function (a, d) { return a + (d.searches || 0); }, 0), bc = (u.by_day || []).reduce(function (a, d) { return a + (d.barcodes || 0); }, 0);
    parts.push('In the last 14 days, ' + tot + ' searches and ' + bc + ' barcode scans.');
    if (u.top_queries && u.top_queries.length) parts.push('Most searched: ' + u.top_queries.slice(0, 5).map(function (q) { return q.words + ', ' + q.count + ' times'; }).join('; ') + '.');
    if (u.top_buys && u.top_buys.length) parts.push('Most tapped buy buttons: ' + u.top_buys.slice(0, 5).map(function (q) { return q.words + ', ' + q.count + ' times'; }).join('; ') + '.');
    if (u.by_lang && u.by_lang.length) parts.push('Languages: ' + u.by_lang.map(function (l) { return l.lang + ', ' + l.devices + ' devices'; }).join('; ') + '.');
    if (s) parts.push('Subscriptions are ' + (s.on ? 'on' : 'off') + '. Subscribers: ' + s.subscribers + '.');
    return parts.join(' ');
  }
  var speaking = false;
  function speakUsage(text) {
    var msg = $('usageSpeakMsg');
    try {
      if (!('speechSynthesis' in window)) { msg.textContent = 'Spoken numbers are not available in this browser.'; return; }
      if (speaking) { speechSynthesis.cancel(); speaking = false; $('usageSpeak').textContent = 'Hear the numbers'; msg.textContent = 'Stopped.'; return; }
      speechSynthesis.cancel();
      var ut = new SpeechSynthesisUtterance(text); ut.rate = 1;
      ut.onend = function () { speaking = false; $('usageSpeak').textContent = 'Hear the numbers'; };
      ut.onerror = function () { speaking = false; $('usageSpeak').textContent = 'Hear the numbers'; };
      speaking = true; $('usageSpeak').textContent = 'Stop'; msg.textContent = 'Speaking…';
      speechSynthesis.speak(ut);
    } catch (e) { speaking = false; msg.textContent = 'Could not speak the numbers.'; }
  }
  $('stores').addEventListener('click', function (e) { var b = e.target.closest('button[data-id]'); if (!b) return; api('status', { id: +b.dataset.id, status: b.dataset.st }).then(load); });
  $('lf').addEventListener('submit', function (e) { e.preventDefault(); api('login', { pin: $('pin').value }).then(function (j) { if (j.ok) { $('pin').value = ''; load(); } else $('lmsg').textContent = j.error === 'locked' ? j.message : 'Wrong PIN.'; }); });
  $('out').addEventListener('click', function () { api('logout', {}).then(load); });
  load();
})();
