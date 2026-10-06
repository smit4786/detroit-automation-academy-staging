/* Forge Line "Real Detroit today" live layer.
 *
 * Integration (in forge-line.html):
 *   <div id="live-transit" hidden></div>
 *   <script>window.FORGE_LIVE_PROXY = "https://<proxy-host>";</script>
 *   <script src="forge-line-live.js" defer></script>
 *
 * Behavior: polls PROXY/api/vehicles every 60s, renders agency counts + vehicle
 * list into #live-transit. If the container is missing, PROXY is unset, or any
 * fetch fails, it hides the section and stays silent — never breaks the page.
 * No dependency on the 3D district runtime.
 */
(function () {
  'use strict';
  var POLL_MS = 60000;

  function init() {
    var el = document.getElementById('live-transit');
    var proxy = window.FORGE_LIVE_PROXY;
    if (!el || !proxy) return; // not integrated yet, or no proxy configured: stay silent
    el.hidden = false;
    var timer = null;

    function render(d) {
      if (!d || !Array.isArray(d.vehicles)) throw new Error('bad payload');
      var byAgency = {};
      d.vehicles.forEach(function (v) {
        byAgency[v.agency] = (byAgency[v.agency] || 0) + 1;
      });
      var parts = Object.keys(byAgency).sort().map(function (a) {
        return a.toUpperCase() + ' ' + byAgency[a];
      });
      var when = d.generated_at || d.updated_at ? new Date(d.generated_at || d.updated_at) : null;
      el.innerHTML =
        '<p class="live-transit-line"><strong>' + d.count + '</strong> buses on the road right now' +
        (parts.length ? ' (' + parts.join(' · ') + ')' : '') +
        (d.stale ? ' <em>· last known positions</em>' : '') +
        (when && !isNaN(when) ? ' <span>· updated ' + when.toLocaleTimeString() + '</span>' : '') +
        '</p>';
    }

    function tick() {
      fetch(proxy.replace(/\/$/, '') + '/api/vehicles', { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(render)
        .catch(function () {
          el.hidden = true; // silent degrade
          if (timer) { clearInterval(timer); timer = null; }
        });
    }

    tick();
    timer = setInterval(tick, POLL_MS);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
