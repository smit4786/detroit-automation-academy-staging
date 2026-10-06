/* DAA owner layer — visitor-safe by default.
   - Loads live.json (announcement bar + hero stats). Fails silent.
   - Telemetry beacon: dormant unless TELEMETRY_ENDPOINT is set. Respects DNT.
   - Commentary mode: owner-only, enabled from the console (sessionStorage). */
(function () {
  'use strict';

  var TELEMETRY_ENDPOINT = null; /* set to the worker /collect URL when deployed */

  function isOwner() {
    try { return sessionStorage.getItem('daa_owner') === '1'; } catch (e) { return false; }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Only http(s) links out of the announcement bar — never javascript:/data:. */
  function safeUrl(u) {
    try {
      var parsed = new URL(u, location.href);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    } catch (e) {}
    return null;
  }

  /* ---------------- live.json ---------------- */
  function applyLive(data) {
    if (!data || typeof data !== 'object') return;
    var a = data.announcement;
    if (a && a.text && !document.querySelector('.announce-bar')) {
      var bar = document.createElement('div');
      bar.className = 'announce-bar';
      bar.setAttribute('role', 'note');
      bar.appendChild(document.createTextNode(a.text));
      var href = a.link ? safeUrl(a.link) : null;
      if (href) {
        var link = document.createElement('a');
        link.href = href;
        link.textContent = a.linkLabel || 'Learn more';
        bar.appendChild(document.createTextNode(' '));
        bar.appendChild(link);
      }
      var nav = document.querySelector('.nav');
      if (nav && nav.parentNode) nav.parentNode.insertBefore(bar, nav);
      else document.body.insertBefore(bar, document.body.firstChild);
    }
    if (Array.isArray(data.stats)) {
      var stats = document.querySelectorAll('.hero-stats .stat');
      data.stats.forEach(function (s, i) {
        if (!stats[i] || !s) return;
        var num = stats[i].querySelector('.stat-num');
        var label = stats[i].querySelector('.stat-label');
        if (num && s.num != null) num.textContent = s.num;
        if (label && s.label) label.textContent = s.label;
      });
    }
  }

  if (document.body) startLive();
  else document.addEventListener('DOMContentLoaded', startLive);
  function startLive() {
    fetch('live.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(applyLive)
      .catch(function () { /* static defaults stand */ });
  }

  /* ---------------- telemetry beacon ---------------- */
  function beacon(type, detail) {
    if (!TELEMETRY_ENDPOINT) return;
    try { if (navigator.doNotTrack === '1') return; } catch (e) {}
    var payload = {
      type: type,
      page: location.pathname,
      ref: document.referrer || null,
      vw: window.innerWidth,
      ts: Date.now(),
      detail: detail == null ? null : String(detail).slice(0, 80)
    };
    try {
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) navigator.sendBeacon(TELEMETRY_ENDPOINT, body);
      else fetch(TELEMETRY_ENDPOINT, { method: 'POST', body: body, keepalive: true });
      window.__daaBeaconSent = true;
    } catch (e) {}
  }

  if (document.readyState === 'complete') beacon('pageview');
  else window.addEventListener('load', function () { beacon('pageview'); });

  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'demoForm') {
      var input = document.getElementById('demoInput');
      beacon('demo-cmd', input ? input.value : null);
    }
  });

  /* ---------------- director's commentary (owner only) ---------------- */
  function commentaryOn() {
    if (!isOwner()) return false;
    try {
      if (sessionStorage.getItem('daa_commentary') === '1') return true;
      return new URLSearchParams(location.search).has('commentary');
    } catch (e) { return false; }
  }

  function renderCommentary(notes) {
    if (!Array.isArray(notes) || !notes.length) return;
    var panel = document.createElement('aside');
    panel.id = 'daa-commentary';
    panel.setAttribute('aria-label', "Director's commentary");
    var html = '<div class="daac-head"><strong>Director&rsquo;s commentary</strong>' +
      '<button type="button" id="daac-close" aria-label="Close commentary">&times;</button></div><ol>';
    notes.forEach(function (n, i) {
      html += '<li><button type="button" data-i="' + i + '"><strong>' +
        escapeHtml(n.title) + '</strong><span>' + escapeHtml(n.note) + '</span></button></li>';
    });
    panel.innerHTML = html + '</ol>';
    document.body.appendChild(panel);
    panel.addEventListener('click', function (e) {
      if (e.target && e.target.id === 'daac-close') {
        try { sessionStorage.removeItem('daa_commentary'); } catch (err) {}
        panel.remove();
        return;
      }
      var btn = e.target.closest ? e.target.closest('button[data-i]') : null;
      if (btn) {
        var n = notes[+btn.getAttribute('data-i')];
        var el = n && document.querySelector(n.selector);
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          el.classList.add('daac-flash');
          setTimeout(function () { el.classList.remove('daac-flash'); }, 1600);
        }
      }
    });
  }

  function startCommentary() {
    if (!commentaryOn()) return;
    var run = function () {
      fetch('commentary.json', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(renderCommentary)
        .catch(function () {});
    };
    if (document.body) run();
    else document.addEventListener('DOMContentLoaded', run);
  }
  startCommentary();

  /* test hook */
  window.DAA_OWNER = { applyLive: applyLive, beacon: beacon, isOwner: isOwner,
                       renderCommentary: renderCommentary, commentaryOn: commentaryOn };
})();
