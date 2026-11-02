/* Live Transit Detroit — V2 shell controller (LTD V2 build 2026-11-01).
   Owns ONLY shell chrome: the sheet host (GF-D2), the board
   (SH-BOARD), map tool wiring, and the fullscreen controller
   (design §4). All transit state and cards are the module
   engine's; this file reads the same public feed files the
   engine polls and drives the engine through its own DOM
   contract (data-action buttons). Engine code is untouched. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------- SH-SHEET ---------------- */
  var sheet = $('#sh-sheet'), scrim = $('#sh-scrim'), sheetTitle = $('#sh-sheet-title'), sheetSub = $('#sh-sheet-sub');
  var VIEWS = {
    card: ['Card', 'Stop · route · vehicle'],
    routes: ['Routes, stops + passes', 'Groups · layers · per-route · search'],
    planner: ['Plan a trip', 'Live fusion · walk-capped'],
    ride: ['Ride Along', 'Pick a bus — it stays centered'],
    places: ['Places', 'Nearby + MoGo stations']
  };
  function openSheet(view) {
    if (!sheet || !VIEWS[view]) return;
    $$('.sheet-mount', sheet).forEach(function (m) {
      m.classList.toggle('active', m.getAttribute('data-view') === view);
    });
    sheetTitle.textContent = VIEWS[view][0];
    sheetSub.textContent = VIEWS[view][1];
    sheet.classList.add('on'); sheet.setAttribute('aria-hidden', 'false');
    if (scrim) scrim.classList.add('on');
  }
  function closeSheet() {
    if (!sheet) return;
    sheet.classList.remove('on'); sheet.setAttribute('aria-hidden', 'true');
    if (scrim) scrim.classList.remove('on');
  }
  $$('[data-sheet]').forEach(function (b) {
    b.addEventListener('click', function () { openSheet(b.getAttribute('data-sheet')); });
  });
  var closeBtn = $('#sh-sheet-close');
  if (closeBtn) closeBtn.addEventListener('click', closeSheet);
  if (scrim) scrim.addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  /* Launcher tiles open the matching sheet view (capture phase;
     the engine's own handler still runs — it focuses the mount,
     which lives inside the sheet). */
  var launcher = $('#lt-launcher');
  if (launcher) launcher.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-action="launcher-tile"]') : null;
    if (!t) return;
    var tile = t.getAttribute('data-tile');
    if (tile === 'plan') openSheet('planner');
    else if (tile === 'ride-along') openSheet('ride');
    else if (tile === 'all-routes') openSheet('routes');
    else if (tile === 'live-map' || tile === 'alerts') closeSheet();
  }, true);

  /* A rendered card (canvas pick, near-me, board row, Ride Along)
     opens the sheet at the card view. The engine signals a card by
     setting #lt-info display:block with content. */
  var info = $('#lt-info');
  if (info && window.MutationObserver) {
    var pending = false;
    new MutationObserver(function () {
      if (pending) return; pending = true;
      requestAnimationFrame(function () {
        pending = false;
        if (info.style.display !== 'none' && info.textContent.trim()) openSheet('card');
      });
    }).observe(info, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  }

  /* ---------------- SH-ALERT: EMPTY hides the panel ---------- */
  var alerts = $('#lt-alerts');
  function syncAlerts() {
    if (!alerts) return;
    var empty = /no active service alerts/i.test(alerts.textContent || '');
    alerts.classList.toggle('is-empty', empty);
  }
  if (alerts && window.MutationObserver) {
    new MutationObserver(syncAlerts).observe(alerts, { childList: true, subtree: true });
  }
  syncAlerts();

  /* ---------------- SH-BOARD ---------------- */
  var rowsEl = $('#sh-board-rows'), metaEl = $('#sh-board-meta'), vehN = $('#sh-veh-n'), vehNote = $('#sh-veh-note');
  var STALE_MS = 900000; /* == config freshness.degradedAfterMs */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function renderBoard(vehs, smartCount, genIso) {
    var by = {};
    vehs.forEach(function (v) {
      var k = String(v.route_id);
      if (!by[k]) by[k] = { route: k, n: 0, dests: {}, agency: v.agency || '' };
      by[k].n++;
      if (v.destination) by[k].dests[v.destination] = (by[k].dests[v.destination] || 0) + 1;
    });
    var rows = Object.keys(by).map(function (k) {
      var g = by[k], dest = '', best = -1;
      Object.keys(g.dests).forEach(function (d) { if (g.dests[d] > best) { best = g.dests[d]; dest = d; } });
      g.dest = dest; return g;
    }).sort(function (a, b) { return b.n - a.n; });
    if (!rows.length) {
      rowsEl.innerHTML = '<div class="emptybox"><b>Empty</b>No buses on the road right now. The map and planner still work from the schedule.</div>';
    } else {
      rowsEl.innerHTML = rows.slice(0, 6).map(function (g, i) {
        return '<button type="button" class="brow" data-route="' + esc(g.route) + '">' +
          '<span class="rchip' + (i === 0 ? ' fill' : '') + '">' + esc(g.route) + '</span>' +
          '<span class="dest"><b>' + esc(g.dest || 'In service') + '</b><small>' + esc(String(g.agency).toUpperCase()) + '</small></span>' +
          '<span class="cnt"><b>' + g.n + '</b><small>buses</small></span></button>';
      }).join('');
      $$('.brow', rowsEl).forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-route');
          var btn = document.querySelector('button[data-action="route-card"][data-route="' + id + '"]');
          if (btn) btn.click(); else openSheet('routes');
        });
      });
    }
    if (vehN) vehN.textContent = vehs.length + ' vehicles';
    if (vehNote) vehNote.textContent = 'on the road' + (smartCount ? ' · +' + smartCount + ' SMART display' : '');
    if (metaEl) {
      var age = genIso ? Date.now() - new Date(genIso).getTime() : NaN;
      var t = genIso ? new Date(genIso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
      metaEl.textContent = (isFinite(age) && age > STALE_MS ? 'STALE · ' : '') + 'Updated ' + t;
    }
  }
  function pollBoard() {
    Promise.allSettled([
      fetch('live-data/vehicles.json', { cache: 'no-store' }).then(function (r) { return r.json(); }),
      fetch('live-data/smart-display.json', { cache: 'no-store' }).then(function (r) { return r.json(); })
    ]).then(function (res) {
      var v = res[0].status === 'fulfilled' ? res[0].value : null;
      var s = res[1].status === 'fulfilled' ? res[1].value : null;
      if (v && Array.isArray(v.vehicles)) renderBoard(v.vehicles, s && s.vehicles ? s.vehicles.length : 0, v.generated_at);
      else if (metaEl) metaEl.textContent = 'Feed unavailable — retrying';
    });
  }
  if (rowsEl) { pollBoard(); setInterval(pollBoard, 60000); }

  /* ---------------- map tools ---------------- */
  var canvas = $('#lt-map');
  function wheel(dy) {
    if (!canvas) return;
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, bubbles: true, cancelable: true }));
  }
  var zi = $('#sh-zoom-in'), zo = $('#sh-zoom-out'), rs = $('#sh-reset');
  if (zi) zi.addEventListener('click', function () { wheel(-300); });
  if (zo) zo.addEventListener('click', function () { wheel(300); });
  if (rs) rs.addEventListener('click', function () {
    /* Reset = the engine's own fit path, via its launcher tile
       (renderer.fitToExtent). If the launcher is collapsed, open
       it first; if the tile never appears, do nothing rather
       than fake a reset. */
    var tile = document.querySelector('[data-action="launcher-tile"][data-tile="live-map"]');
    if (tile) { tile.click(); return; }
    var tog = document.querySelector('[data-action="launcher-toggle"]');
    if (tog) {
      tog.click();
      setTimeout(function () {
        var t2 = document.querySelector('[data-action="launcher-tile"][data-tile="live-map"]');
        if (t2) t2.click();
      }, 80);
    }
  });

  /* ---------------- SH-FS fullscreen (§4) ---------------- */
  var frame = $('#lt-frame'), fsBtn = $('#sh-fs'), savedScroll = 0;
  function pseudoOn() { return frame && frame.classList.contains('pseudo-fs'); }
  function nativeOn() { return document.fullscreenElement === frame; }
  function fsOn() { return nativeOn() || pseudoOn(); }
  function syncFsBtn() {
    if (!fsBtn) return;
    var on = fsOn();
    fsBtn.classList.toggle('active', on);
    fsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function enterPseudo() {
    savedScroll = window.scrollY || 0;
    frame.classList.add('pseudo-fs');
    document.body.classList.add('fs-lock');
    window.scrollTo(0, 0);
    syncFsBtn();
  }
  function exitPseudo() {
    frame.classList.remove('pseudo-fs');
    document.body.classList.remove('fs-lock');
    window.scrollTo(0, savedScroll);
    syncFsBtn();
  }
  if (fsBtn && frame) fsBtn.addEventListener('click', function () {
    if (pseudoOn()) { exitPseudo(); return; }
    if (nativeOn()) { if (document.exitFullscreen) document.exitFullscreen(); return; }
    var req = frame.requestFullscreen || frame.webkitRequestFullscreen;
    if (req) {
      var p;
      try { p = req.call(frame); } catch (e) { p = null; }
      if (p && p.catch) p.catch(function () { enterPseudo(); });
      setTimeout(syncFsBtn, 60);
    } else enterPseudo();
  });
  document.addEventListener('fullscreenchange', syncFsBtn);
  document.addEventListener('webkitfullscreenchange', syncFsBtn);
})();
