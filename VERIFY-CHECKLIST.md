# Whole-set behavior verification — runs on staging after the assembly push

Bytes first (C, foreground): staging head == push commit; served MD5 ==
release pins for live-transit.html, index.html, signal/index.html,
press/index.html (5575186f…), 404 probe serves release 404 (6fa0f13b…).

Behavior (browser, on the staging origin; PRD §10 matrix rows):
1. Home: loads, own masthead (Detroit Automation Academy), nav includes
   The Index; The Index page opens from nav on ≥2 views.
2. The Index: renders from registry.json; generated_at stamp visible and
   current; projects/gates/implementations sections populated; no
   internal-flagged items rendered.
3. Live Transit: app boots (13 mounts live), vehicles render from the
   PRODUCTION data plane with fresh age readout (REQ-D-2); pan + zoom +
   tap a vehicle → info card; routes show gradient differentiation.
4. Opacity control: slider in the map cluster (vertical stack); drag to
   ~40% → routes/vehicles visibly fade, basemap unchanged in kind;
   restore 100%.
5. Planner: submit a trip (e.g. Woodward corridor) → itinerary returns,
   walk legs ≤30 min; Ride Along starts on a chosen trip.
6. Filters + browse: filter panel toggles stack vertically; a route
   filter with 0 vehicles still shows its row (empty-state rule).
7. Fullscreen: enters/exits cleanly; page stable ≥60 s, no errors.
8. Signal: own masthead (NOT Live Transit); latest edition listed.
9. Press (assembled set): search "Air India" → 2 of 496, Latest hidden;
   clear restores. (Re-verify of E1 on shared v3 assets.)
10. Cities hub: 8 cities listed; a city link resolves.
11. 404: bogus path serves the release 404 with working set links.

Any FAIL → fix forward on the release tree or roll staging back to
c49a39cd (Press-only state) per C11 discipline; record in the evidence pack.
