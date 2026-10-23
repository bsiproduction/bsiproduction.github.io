/* Which camera, and how sharp (2026-10-23, the first truck load: on Tristan's Android "the QR codes never came into focus so I couldn't
 * scan anything"; Danny's iPhone was fine). A bare facingMode: environment on a multi-lens Android often gets a fixed-focus wide lens at
 * 640x480. Shared by the crew link's camera (index.html), the camera window (scan/live.html) and the scan page (scan/index.html).
 *   - asks for a 1080p stream (ideal, so any camera still answers) and continuous focus where the camera has it
 *   - picks the main back lens: not wide / ultra / tele / macro / depth, lowest "camera2 N" (Android); iPhones keep Safari's own pick
 *   - the camera in use is remembered on this phone (KEY) and opened first next time; next() steps through the back cameras
 * open() → Promise of { stream, backs } (backs = the back cameras, [] when the phone won't say); next(stream, backs) → Promise of a stream.
 * Every call is guarded: a browser without getCapabilities / enumerateDevices / localStorage just gets the plain camera. */
(function (root) {
  var KEY = 'bsi.cam.device';
  var ua = navigator.userAgent, apple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  function saved() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function save(id) { try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch (e) {} }
  function stopAll(st) { try { st.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} }
  function track(st) { try { return st.getVideoTracks()[0] || null; } catch (e) { return null; } }
  function idOf(st) { try { var s = track(st).getSettings(); return (s && s.deviceId) || ''; } catch (e) { return ''; } }
  // one camera (id) or "the back one"; the size is only ideal, but a strict browser that still refuses gets the bare ask
  function gum(id) {
    function ask(size) {
      var v = id ? { deviceId: { exact: id } } : { facingMode: { ideal: 'environment' } };
      if (size) { v.width = { ideal: 1920 }; v.height = { ideal: 1080 }; }
      return navigator.mediaDevices.getUserMedia({ video: v, audio: false });
    }
    return ask(true).catch(function (err) { if (err && err.name === 'OverconstrainedError') return ask(false); throw err; });
  }
  // a code on a case label is a hand's length away: a lens that hunts once and stops never gets it sharp
  function focus(st) {
    try {
      var t = track(st), c = t && t.getCapabilities && t.getCapabilities();
      if (c && c.focusMode && c.focusMode.indexOf('continuous') !== -1) t.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {});
    } catch (e) {}
    return st;
  }
  // the back cameras (labels are blank until the camera is allowed, so this runs after a stream has started)
  function backs() {
    try {
      return navigator.mediaDevices.enumerateDevices().then(function (list) {
        return list.filter(function (d) {
          if (d.kind !== 'videoinput' || !d.deviceId) return false;
          if (/back|rear|environment/i.test(d.label || '')) return true;
          try { var c = d.getCapabilities && d.getCapabilities(); return !!(c && c.facingMode && c.facingMode.indexOf('environment') !== -1); } catch (e) { return false; }
        });
      }).catch(function () { return []; });
    } catch (e) { return Promise.resolve([]); }
  }
  // the main lens: a plain name beats wide / tele / macro, then Android's lowest camera2 number (camera2 0 is the main back one)
  function main(list) {
    function odd(d) { return /wide|ultra|tele|macro|depth/i.test(d.label || '') ? 1 : 0; }
    function n(d) { var m = /camera2 (\d+)/i.exec(d.label || ''); return m ? +m[1] : 99; }
    return list.slice().sort(function (a, b) { return odd(a) - odd(b) || n(a) - n(b) || list.indexOf(a) - list.indexOf(b); })[0];
  }
  function open() {
    var mine = saved();
    // the remembered camera first; gone (a new phone, cleared site data) = forget it and ask for the back one
    var first = mine ? gum(mine).catch(function (err) {
      if (err && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) { save(''); return gum(''); }
      throw err;
    }) : gum('');
    return first.then(function (st) {
      focus(st);
      return backs().then(function (list) {
        if (saved() || apple || list.length < 2) return { stream: st, backs: list };
        var best = main(list);
        if (!best || best.deviceId === idOf(st)) { if (best) save(best.deviceId); return { stream: st, backs: list }; }
        // most Androids open one camera at a time: let go of this one before asking for the main lens
        stopAll(st);
        return gum(best.deviceId).then(function (s) { save(best.deviceId); return { stream: focus(s), backs: list }; },
          function () { return gum('').then(function (s) { return { stream: focus(s), backs: list }; }); });
      });
    });
  }
  // Switch lens: the next back camera, remembered for next time; one that won't start = the plain back camera again
  function next(st, list) {
    var cur = idOf(st), i = -1;
    (list || []).forEach(function (d, k) { if (d.deviceId === cur) i = k; });
    var d = list && list.length ? list[(i + 1) % list.length] : null;
    stopAll(st);
    if (!d) return gum('').then(focus);
    return gum(d.deviceId).then(function (s) { save(d.deviceId); return focus(s); }, function () { save(''); return gum('').then(focus); });
  }
  root.BsiCam = { KEY: KEY, open: open, next: next };
})(this);
