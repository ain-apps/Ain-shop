/* AIN Shop — phone-call / interruption handling (v36).
   A phone call (or the app going away) pauses the voice — stops speaking and listening — and when the call ends the
   app resumes exactly where it left off: same search, same results, nothing lost. The results and the conversation
   stay on screen while paused; resume only re-opens the microphone and tells the voice to carry on.
   - Phone call in the wrapper: the wrapper bridges AVAudioSession interruptions to onInterruption(true/false).
   - Phone call on the website: iOS Safari pauses the voice audio when a call comes in — the audio element's pause
     event is the signal; coming back to the tab resumes.
   - App switched away: the page hides. If the mini window is on ("keep talking while I use other apps"), the voice
     keeps going (background audio in the wrapper). Otherwise the voice pauses at once, resumes if the person is back
     within 60 seconds, and the call ends after 60 seconds away (so an abandoned call does not run on and cost money).
   window.BAIN_CALLPAUSE */
(function (root) {
  'use strict';
  var P = { paused: false, reason: null, stopT: null, audio: null, ours: false, watched: false };
  function ai() { return root.BAIN_AI || null; }
  function aiOn() { var a = ai(); return !!(a && a.active && a.active()); }
  function isWrapper() { try { return /AINShopiOS/.test(navigator.userAgent || ''); } catch (e) { return false; } }
  function keepTalking() { try { return root.BAIN_MINI && BAIN_MINI.active(); } catch (e) { return false; } }
  function pause(reason) {
    if (P.paused || !aiOn()) return false;
    var a = ai();
    if (a.pauseVoice) { try { a.pauseVoice(reason); } catch (e) { return false; } }
    else if (a.stop) return false;   // no pause support: never stop silently — the caller keeps the old behaviour
    P.paused = true; P.reason = reason || 'call';
    return true;
  }
  function resume() {
    if (!P.paused) return false;
    var a = ai();
    if (a.resumeVoice) { try { a.resumeVoice(P.reason); } catch (e) { return false; } }
    P.paused = false; P.reason = null;
    return true;
  }
  function clearStop() { if (P.stopT) { clearTimeout(P.stopT); P.stopT = null; } }
  function onHidden() {
    if (!aiOn()) return;
    if (keepTalking()) return;   // the person shrank the app on purpose: the voice keeps going
    if (isWrapper()) return;   // background audio keeps the voice going in the wrapper; the call itself ends at its own cap
    if (!pause('hidden')) {   // no pause support in this build: fall back to the old rule — end the call after 20 s away
      clearStop();
      P.stopT = setTimeout(function () { P.stopT = null; if (document.hidden && aiOn()) { var a = ai(); if (a && a.stop) a.stop('hidden'); } }, 20000);
      return;
    }
    clearStop();
    P.stopT = setTimeout(function () { P.stopT = null; if (document.hidden && aiOn()) { var a = ai(); if (a && a.stop) a.stop('hidden'); P.paused = false; P.reason = null; } }, 60000);
  }
  function onVisible() {
    clearStop();
    if (P.paused && P.reason === 'hidden') resume();
    else if (P.paused && P.reason === 'call') resume();   // back from a call: the tab is visible again, so carry on
  }
  function onInterruption(began) {
    if (began) pause('call');
    else if (P.paused && P.reason === 'call') resume();
  }
  // the website's phone-call signal: Safari pauses the voice audio when a call comes in
  function watchAudio() {
    if (P.watched) return; P.watched = true;
    function attach() {
      var a = ai(); if (!a || !a.audioEl) return;
      var el = null; try { el = a.audioEl(); } catch (e) {}
      if (!el || el === P.audio) return;
      P.audio = el;
      el.addEventListener('pause', function () {
        if (P.ours) return;   // we paused it ourselves (pauseVoice) — not a call
        if (aiOn() && !P.paused) pause('call');
      });
    }
    attach();
    if (typeof document !== 'undefined') setInterval(attach, 5000);   // the audio element is recreated per call; re-attach cheaply (browser only — never in a test run)
  }
  function markOurs(v) { P.ours = !!v; }
  root.BAIN_CALLPAUSE = { pause: pause, resume: resume, onHidden: onHidden, onVisible: onVisible, onInterruption: onInterruption, watchAudio: watchAudio, markOurs: markOurs, paused: function () { return P.paused; }, reason: function () { return P.reason; }, isWrapper: isWrapper };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BAIN_CALLPAUSE;
})(typeof window !== 'undefined' ? window : globalThis);
