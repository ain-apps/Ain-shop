/* AIN Shop v20 — background-noise gate (BAIN_GATE). Listens to the same microphone the call uses (it never changes the sound
   that is sent) and tells, for each stretch the voice detector heard, whether it was a real nearby voice:
   - a cough, sneeze, door, clap or click: a short burst with almost no voiced sound → "noise"
   - traffic, a fan, an air conditioner, rain: steady sound → the noise floor follows it, so it never counts as voice → "noise"
   - people talking far away, a crowd, a TV across the room: voiced, but hardly louder than the room → "far"
   - the person near the phone (also a quiet or older voice): voiced and clearly above the room → "voice"
   How: every ~20 ms a 40 ms window is cut to ~16 kHz, and three things are measured in the speech band (80–3400 Hz):
   loudness, how far it stands above the room's own level (the floor follows the quietest moments, rises 1.5 dB/s),
   and voicing (the band-limited autocorrelation at a pitch between 75 and 400 Hz — vowels have it, noise does not).
   It never makes the app stricter when it is not sure: no microphone access for it, too few frames, or an old browser → "unknown",
   and the app behaves as before. Pure functions (frame(), judge()) are shared with the unit tests in Node. */
(function (root) {
  'use strict';
  var N = 2048, LOG10 = Math.log(10);
  function fft(re, im) {   // in-place radix-2
    var n = re.length, i, j, k, l;
    for (i = 1, j = 0; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (l = 2; l <= n; l <<= 1) { var a = -2 * Math.PI / l, wr = Math.cos(a), wi = Math.sin(a);
      for (i = 0; i < n; i += l) { var cr = 1, ci = 0; for (k = 0; k < l / 2; k++) { var p = i + k, q = p + l / 2, xr = re[q] * cr - im[q] * ci, xi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi; var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
  }
  var wcache = {};
  function hann(m) { if (wcache[m]) return wcache[m]; var w = new Float64Array(m), i; for (i = 0; i < m; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / m);
    var re = new Float64Array(N), im = new Float64Array(N); for (i = 0; i < m; i++) re[i] = w[i]; fft(re, im);
    for (i = 0; i < N; i++) { re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; } fft(re, im); var ac = new Float64Array(N); for (i = 0; i < N; i++) ac[i] = re[i] / re[0];
    return (wcache[m] = { w: w, ac: ac }); }
  function db(x) { return 10 * Math.log(Math.max(x, 1e-12)) / LOG10; }
  // one analysis window → { lvl (dB, speech band), voicing (0..1), snr (dB above the room) }; st carries the room's floor
  function frame(samples, sampleRate, st, dtMs) {
    var dec = Math.max(1, Math.round(sampleRate / 16000)), fs = sampleRate / dec, m = Math.min(Math.floor(samples.length / dec), 1024), i, k;
    if (m < 256) return null;
    var x = new Float64Array(m), mean = 0, off = samples.length - m * dec;
    for (i = 0; i < m; i++) { var s = 0; for (k = 0; k < dec; k++) s += samples[off + i * dec + k]; x[i] = s / dec; mean += x[i]; }
    mean /= m; var H = hann(m), re = new Float64Array(N), im = new Float64Array(N);
    for (i = 0; i < m; i++) re[i] = (x[i] - mean) * H.w[i];
    fft(re, im);
    var bw = fs / N, k80 = Math.ceil(80 / bw), k300 = Math.ceil(300 / bw), k3400 = Math.min(N / 2 - 1, Math.floor(3400 / bw)), band = 0, P = new Float64Array(N);
    for (k = 0; k <= N / 2; k++) { var p = re[k] * re[k] + im[k] * im[k]; if (k >= k80 && k <= k3400) { P[k] = p; if (k > 0 && k < N / 2) P[N - k] = p; if (k >= k300) band += p; } }
    var lvl = db(band / (m * m) * 8 + 1e-14);
    for (i = 0; i < N; i++) { re[i] = P[i]; im[i] = 0; } fft(re, im);
    var voicing = 0; if (re[0] > 0) { var lo = Math.floor(fs / 400), hi = Math.min(Math.ceil(fs / 75), m - 64);
      for (i = lo; i <= hi; i++) { var r = (re[i] / re[0]) / Math.max(H.ac[i], 0.05); if (r > voicing) voicing = r; } }
    voicing = Math.min(1, voicing);
    st = st || {}; var dt = dtMs || 20;
    // digital silence (a muted microphone while the AI talks on the loudspeaker, or the first moment of a stream) is not the room:
    // it never pulls the floor down, or every sound after it would look 60 dB "loud"
    if (lvl < SILENT_DB) return { lvl: lvl, voicing: 0, snr: 0, silent: true };
    if (st.floor == null) st.floor = lvl;
    else if (lvl < st.floor) st.floor = st.floor + (lvl - st.floor) * Math.min(1, dt / 60);   // falls fast to a quieter moment
    else st.floor += 1.5 * dt / 1000;                                                          // rises slowly: steady noise is learned in a few s
    return { lvl: lvl, voicing: voicing, snr: lvl - st.floor };
  }
  var SILENT_DB = -95;
  var MIN_DB = -78;   // below this nothing is voice (digital silence / muted mic); a quiet voice after the phone's own gain is far above it
  var VOICING = 0.7;   // measured on real clips (Oct 28): speech frames median 0.81–0.86; cough 0.37, door slam 0.35
  function voiced(f) { return !!f && f.voicing >= VOICING && f.snr >= 6 && f.lvl >= MIN_DB; }
  // frames: [{t, lvl, voicing, snr}] for one stretch → { verdict, voicedMs, runMs, snr }
  function judge(frames, hopMs) {
    hopMs = hopMs || 20;
    if (!frames || frames.length < 5) return { verdict: 'unknown', voicedMs: 0, runMs: 0, snr: null };
    var v = 0, run = 0, best = 0, snrs = [];
    frames.forEach(function (f) { if (voiced(f)) { v++; run++; if (run > best) best = run; snrs.push(f.snr); } else run = 0; });
    snrs.sort(function (a, b) { return a - b; });
    var snr = snrs.length ? snrs[Math.floor(snrs.length * 0.8)] : null, voicedMs = v * hopMs, runMs = best * hopMs, verdict;
    if (voicedMs < 120 || runMs < 80) verdict = 'noise';   // a cough / door / click: almost no vowel sound (a short "no" still has ~150 ms)
    else if (snr < 15) verdict = 'far';   // a crowd / far TV measured 14 dB above the room; a near voice 17–51 dB (a quiet older voice in a café: 18)
    else verdict = 'voice';
    return { verdict: verdict, voicedMs: voicedMs, runMs: runMs, snr: snr == null ? null : Math.round(snr * 10) / 10 };
  }
  // ---- in the page: follows the call's microphone stream ----
  var live = null, primed = null;
  // v22 STATIC FIX (Nati: "this app has static noise in the background"): on iPhone/iPad a sound context running next to the call's own
  // audio, at its own sample rate, puts static on the AI's voice (the same cause the AIN Torah app fixed in hr-v27). So on Apple phones
  // and tablets the gate stays off (no sound context at all) and the call works as in v19: the transcript checks (promptEcho, isEchoOf,
  // sound words) and the AI's ignore_sound still filter noise. localStorage "bain:gate" = "on" / "off" overrides (tests).
  function apple() { try { var n = root.navigator || {}, ua = n.userAgent || ''; return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && n.maxTouchPoints > 1); } catch (e) { return false; } }
  function allowed() { var o = null; try { o = root.localStorage && root.localStorage.getItem('bain:gate'); } catch (e) {} if (o === 'on') return true; if (o === 'off') return false; return !apple(); }
  // called inside the tap (iPhone only lets a sound context run when it is made during a tap); start() uses it
  function prime() {
    if (!allowed()) return;
    try { var AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
      if (!primed || primed.state === 'closed') primed = new AC();
      if (primed.state === 'suspended' && primed.resume) { var r = primed.resume(); if (r && r.catch) r.catch(function () {}); } } catch (e) { primed = null; }
  }
  function start(stream) {
    stop();
    if (!allowed()) return false;
    try {
      var AC = root.AudioContext || root.webkitAudioContext; if (!AC || !stream) return false;
      var ctx = primed && primed.state !== 'closed' ? primed : new AC(); primed = null;
      var src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
      src.connect(an);
      var L = live = { ctx: ctx, an: an, src: src, buf: new Float32Array(an.fftSize), st: {}, frames: [], last: 0, ok: false };
      if (ctx.state === 'suspended' && ctx.resume) { var r = ctx.resume(); if (r && r.catch) r.catch(function () {}); }
      L.iv = setInterval(function () {
        if (live !== L || L.ctx.state !== 'running') return;
        var now = Date.now(), dt = L.last ? Math.min(200, now - L.last) : 20; L.last = now;
        L.an.getFloatTimeDomainData(L.buf);
        var f = frame(L.buf, L.ctx.sampleRate, L.st, dt); if (!f) return;
        f.t = now; L.frames.push(f); L.ok = true;
        while (L.frames.length && now - L.frames[0].t > 30000) L.frames.shift();
      }, 20);
      return true;
    } catch (e) { live = null; return false; }
  }
  function stop() { var P = primed; primed = null; if (P && P.state !== 'closed') try { P.close(); } catch (e) {}   // v22: a primed context never outlives the call
    var L = live; live = null; if (!L) return; clearInterval(L.iv); try { L.src.disconnect(); } catch (e) {} try { L.ctx.close(); } catch (e) {} }
  function running() { return !!(live && live.ok && live.ctx.state === 'running' && Date.now() - live.last < 500); }
  // what was heard between two moments (ms since epoch): the voice detector's stretch, with a little room either side
  function between(t0, t1) {
    if (!running()) return { verdict: 'unknown', voicedMs: 0, runMs: 0, snr: null };
    var fr = live.frames.filter(function (f) { return f.t >= t0 && f.t <= t1; });
    var r = judge(fr, 20); r.frames = fr.length; return r;
  }
  root.BAIN_GATE = { allowed: allowed, apple: apple, prime: prime, frame: frame, judge: judge, voiced: voiced, start: start, stop: stop, running: running, between: between, _live: function () { return live; } };
})(typeof window !== 'undefined' ? window : globalThis);
