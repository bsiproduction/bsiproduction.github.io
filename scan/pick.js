/* Which code a camera frame means (2026-10-02, Tristan: with several codes in view "there was a long delay, then it registered ALL the
 * codes all of a sudden"). Shared by the crew link's camera (index.html) and the camera window (scan/live.html).
 *   - several codes in view: the one nearest the middle of the picture is the one meant
 *   - it must be the same code two reads in a row (a code sliding past the middle doesn't count)
 *   - a code counts once while it stays in view; again only once it has been out of view 2 s
 *   - one at a time: nothing new is sent while the last scan's answer hasn't come back (8 s at most)
 * frame(codes, now) takes [{t: text, x, y}] (x, y = the code's centre as a share of the picture, 0..1) and returns the text to send, or ''.
 * answered() is called when ShopCall's result comes back. */
(function (root) {
  function picker() {
    var seen = {}, fired = {}, prev = '', waiting = 0;
    return {
      frame: function (codes, now) {
        codes = (codes || []).filter(function (c) { return c && c.t; });
        codes.forEach(function (c) { seen[c.t] = now; });
        Object.keys(fired).forEach(function (k) { if (now - (seen[k] || 0) > 2000) delete fired[k]; });
        if (!codes.length) { prev = ''; return ''; }
        var off = function (c) { return Math.pow((c.x == null ? .5 : c.x) - .5, 2) + Math.pow((c.y == null ? .5 : c.y) - .5, 2); };
        var pick = codes.slice().sort(function (a, b) { return off(a) - off(b); })[0];
        if (pick.t !== prev) { prev = pick.t; return ''; }
        if (fired[pick.t] || (waiting && now - waiting < 8000)) return '';
        fired[pick.t] = true; waiting = now;
        return pick.t;
      },
      answered: function () { waiting = 0; },
    };
  }
  /** A BarcodeDetector result or a jsQR one → [{t, x, y}] (w, h: the picture's size in the same pixels). */
  function fromDetector(list, w, h) {
    return (list || []).map(function (c) { var b = c.boundingBox || {}; return { t: String(c.rawValue || '').trim(), x: w ? (b.x + b.width / 2) / w : .5, y: h ? (b.y + b.height / 2) / h : .5 }; });
  }
  function fromJsQr(code, w, h) {
    if (!code || !code.data) return [];
    var l = code.location || {}, a = l.topLeftCorner, b = l.bottomRightCorner;
    return [{ t: String(code.data).trim(), x: a && b && w ? (a.x + b.x) / 2 / w : .5, y: a && b && h ? (a.y + b.y) / 2 / h : .5 }];
  }
  var api = { picker: picker, fromDetector: fromDetector, fromJsQr: fromJsQr };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BsiPick = api;
})(this);
