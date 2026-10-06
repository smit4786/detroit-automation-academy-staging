/* Forge Line "Next arrivals" board — LIVE POSITIONS ONLY.
 *
 * For each baked key stop, shows DDOT buses on the serving route that are
 * currently near the stop, based on the live proxy feed. This board reports
 * OBSERVED positions, never schedule predictions: the published DDOT GTFS
 * schedule feed expired 2026-09-20 and its download URL returns HTTP 403, so
 * no trustworthy schedule data exists to show. Labels say "live", never
 * "scheduled".
 *
 * Usage:
 *   <div id="next-arrivals"></div>
 *   <script>window.FORGE_LIVE_PROXY = "https://forge-line-live-proxy.netlify.app";</script>
 *   <script src="forge-line-arrivals.js?v=..." defer></script>
 *
 * Polls PROXY/api/vehicles every 60s. A bus within 1.5 km of a stop whose
 * reported bearing points at the stop (within 60 deg) is "approaching";
 * within 1.5 km but not bearing toward it is "nearby". Both are labeled
 * honestly. On fetch failure the board shows a retrying note, never stale
 * times presented as current.
 */
(function () {
  'use strict';

  var POLL_MS = 60000;
  var TIMEOUT_MS = 20000;
  var RADIUS_KM = 1.5;
  var APPROACH_DEG = 60;

  // Key stops, verified against DDOT stops.txt (lat/lon as published).
  // Chosen: the two downtown Rosa Parks Transit Center bays serving our
  // routes, plus the highest-trip-count mid-corridor stop on each route.
  var STOPS = [
    { id: '5675', name: 'Rosa Parks Transit Center \u2013 Bay 15', route: '4',  routeName: 'Woodward',   lat: 42.332903, lon: -83.052788 },
    { id: '447',  name: 'Rosa Parks Transit Center \u2013 Bay 14', route: '16', routeName: 'Dexter',     lat: 42.332999, lon: -83.052713 },
    { id: '874',  name: 'Lafayette & Cass',                        route: '1',  routeName: 'Vernor',     lat: 42.330093, lon: -83.051789 },
    { id: '856',  name: 'Woodward & Warren',                       route: '4',  routeName: 'Woodward',   lat: 42.357365, lon: -83.064405 },
    { id: '5032', name: 'Greenfield & Warren',                     route: '10', routeName: 'Greenfield', lat: 42.343955, lon: -83.196414 },
    { id: '93',   name: 'Dexter & Elmhurst',                       route: '16', routeName: 'Dexter',     lat: 42.380790, lon: -83.125073 }
  ];

  function toRad(d) { return d * Math.PI / 180; }

  function haversineKm(aLat, aLon, bLat, bLon) {
    var R = 6371;
    var dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function bearingTo(aLat, aLon, bLat, bLon) {
    var dLon = toRad(bLon - aLon);
    var y = Math.sin(dLon) * Math.cos(toRad(bLat));
    var x = Math.cos(toRad(aLat)) * Math.sin(toRad(bLat)) -
            Math.sin(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function angleDiff(a, b) {
    return Math.abs(((a - b + 540) % 360) - 180);
  }

  function fmtDist(km) {
    if (km < 0.15) return 'at the stop';
    var mi = km * 0.621371;
    return mi < 0.1 ? 'under 0.1 mi away' : mi.toFixed(1) + ' mi away';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function init() {
    var host = document.getElementById('next-arrivals');
    var grid = document.getElementById('arrivals-grid');
    var proxy = window.FORGE_LIVE_PROXY;
    if (!host || !grid || !proxy) return; // not integrated: stay silent
    var timer = null;

    function classify(stop, v) {
      var d = haversineKm(v.lat, v.lon, stop.lat, stop.lon);
      if (d > RADIUS_KM) return null;
      var approaching = (typeof v.bearing === 'number') &&
        angleDiff(v.bearing, bearingTo(v.lat, v.lon, stop.lat, stop.lon)) <= APPROACH_DEG;
      return { v: v, distKm: d, approaching: approaching };
    }

    function busLine(c) {
      var v = c.v;
      var pill = c.approaching
        ? '<span class="pill-live">Live</span>'
        : '<span class="pill-nearby">Live \u00b7 nearby</span>';
      var bits = [fmtDist(c.distKm)];
      if (c.approaching) bits[0] = bits[0].replace('away', 'away, heading this way');
      if (v.vehicle_id) bits.push('bus #' + esc(v.vehicle_id));
      if (typeof v.speed_mph === 'number') bits.push(v.speed_mph + ' mph');
      return '<li class="arrival-live">' + pill + esc(bits.join(' \u00b7 ')) + '</li>';
    }

    function render(vehicles) {
      var html = STOPS.map(function (stop) {
        var near = [];
        vehicles.forEach(function (v) {
          if (String(v.route_id) !== stop.route) return;
          if (typeof v.lat !== 'number' || typeof v.lon !== 'number') return;
          var c = classify(stop, v);
          if (c) near.push(c);
        });
        near.sort(function (a, b) {
          if (a.approaching !== b.approaching) return a.approaching ? -1 : 1;
          return a.distKm - b.distKm;
        });
        var approaching = near.filter(function (c) { return c.approaching; }).slice(0, 2);
        var lines = approaching.length
          ? approaching.map(busLine).join('')
          : (near.length
              ? busLine(near[0])
              : '<li class="arrival-quiet">No live buses near this stop right now.</li>');
        return '<div class="arrival-card">' +
          '<h4>' + esc(stop.name) + '</h4>' +
          '<p class="arrival-route">Route ' + esc(stop.route) + ' \u00b7 ' + esc(stop.routeName) + '</p>' +
          '<ul>' + lines + '</ul></div>';
      }).join('');
      grid.innerHTML = html;
    }

    function fail() {
      grid.innerHTML = '<p class="arrivals-status">Live arrivals unavailable \u2014 retrying&hellip;</p>';
    }

    function tick() {
      var ctrl = new AbortController();
      var killer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
      fetch(proxy.replace(/\/$/, '') + '/api/vehicles', { cache: 'no-store', signal: ctrl.signal })
        .then(function (r) {
          clearTimeout(killer);
          if (!r.ok) throw new Error('http ' + r.status);
          return r.json();
        }, function (e) { clearTimeout(killer); throw e; })
        .then(function (d) {
          if (!d || !Array.isArray(d.vehicles)) throw new Error('bad payload');
          render(d.vehicles);
        })
        .catch(fail);
    }

    tick();
    timer = setInterval(tick, POLL_MS);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
