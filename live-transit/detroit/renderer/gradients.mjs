// renderer/gradients.mjs — the palette token layer (REQ-V-6/V-7).
// Platform rebuild R3 seam-adjacent. Label: UNVERIFIED /
// legacy-unsigned.
//
// REQ-V-6 (owner, 2026-11-02 09:51 EST; PRD §16): route and vehicle
// identity in the B/W system is carried by ATOMIC GRAYSCALE
// GRADIENTS, not flat grays and never hue. The family is atomic:
// 11 base ramps x 8 direction angles = 88 tokens; every stop of
// every ramp is a single gray byte (r = g = b by construction).
//
// Assignment is deterministic from the REGISTRY: routes take
// tokens in registry order — config routesByFeed order (ddot,
// smart, qline), document order within each feed — registry
// index i takes token i (ramp = floor(i / 8), angle = (i mod 8)).
// Detroit's registry is 83 routes, so tokens G00..G82 are bound
// and G83..G87 are reserve. The full route -> token table is
// ATOMIC-GRADIENTS.md at the build-tree root.
//
// REQ-V-7 (owner-directed BEHAVIOR, same directive): LAYER_OPACITY
// below is the token set the renderer's layer materials read;
// the defaults are exactly the values the V1-derived renderer
// shipped (streets 0.9, water 0.85, water lines 0.5, routes /
// vehicles / stops full), so first paint is unchanged until the
// rider moves the opacity control.

/** Direction angles of the family, degrees (CSS convention). */
export const GRADIENT_ANGLES = Object.freeze([0, 45, 90, 135, 180, 225, 270, 315]);

/** Base ramps as [from, to] gray bytes — light end first; the
 *  angle supplies direction, so ramps are value pairs only. */
export const GRADIENT_RAMPS = Object.freeze([
  Object.freeze([0xf0, 0x26]),
  Object.freeze([0xdb, 0x38]),
  Object.freeze([0xc7, 0x4d]),
  Object.freeze([0xb3, 0x61]),
  Object.freeze([0xf0, 0x61]),
  Object.freeze([0xdb, 0x26]),
  Object.freeze([0xc7, 0x26]),
  Object.freeze([0xb3, 0x38]),
  Object.freeze([0x9e, 0x26]),
  Object.freeze([0xf0, 0x4d]),
  Object.freeze([0xc7, 0x38]),
]);

const hex2 = (b) => b.toString(16).padStart(2, '0');
/** A gray byte as a CSS hex color (r = g = b). */
export function grayCss(byte) {
  const h = hex2(Math.max(0, Math.min(255, Math.round(byte))));
  return `#${h}${h}${h}`;
}

function makeToken(index) {
  const perRamp = GRADIENT_ANGLES.length;
  const ramp = Math.floor(index / perRamp) % GRADIENT_RAMPS.length;
  const angleDeg = GRADIENT_ANGLES[index % perRamp];
  const [from, to] = GRADIENT_RAMPS[ramp];
  return Object.freeze({
    id: `G${String(index).padStart(2, '0')}`,
    index, ramp, angleDeg, from, to,
    css: `linear-gradient(${angleDeg}deg, ${grayCss(from)}, ${grayCss(to)})`,
    midCss: grayCss((from + to) / 2),
  });
}

/** The full atomic family: 88 tokens, G00..G87. */
export const GRADIENT_TOKENS = Object.freeze(
  Array.from({ length: GRADIENT_RAMPS.length * GRADIENT_ANGLES.length }, (_, i) => makeToken(i)));

/** Token for a registry index (route order of assignment), or
 *  null beyond the family. */
export function gradientTokenForIndex(i) {
  return Number.isInteger(i) && i >= 0 && i < GRADIENT_TOKENS.length
    ? GRADIENT_TOKENS[i] : null;
}

/**
 * Gradient coordinate s in [0, 1] for a point on a ribbon: t is
 * the along-path fraction (0 at the path start, 1 at the end),
 * u the across fraction (0 at the -offset edge, 1 at +offset).
 * The token angle projects (t, u) onto the gradient direction —
 * the planar analogue of the CSS linear-gradient direction.
 */
export function gradientCoordinate(t, u, angleDeg) {
  const th = (angleDeg * Math.PI) / 180;
  const s = 0.5 + (t - 0.5) * Math.cos(th) + (u - 0.5) * Math.sin(th);
  return Math.max(0, Math.min(1, s));
}

/** Interpolated gray value (0..1 float) of a token at s. */
export function gradientValueAt(spec, s) {
  const v = (spec.from + (spec.to - spec.from) * Math.max(0, Math.min(1, s))) / 255;
  return v;
}

function pushGray(out, o, spec, s, shade) {
  const v = gradientValueAt(spec, s) * shade;
  out[o] = v; out[o + 1] = v; out[o + 2] = v;
}

/**
 * Vertex colors for a ribbonGeometry result (deck / glow /
 * casing-width ribbons): 2 vertices per station, +offset vertex
 * first (u = 1), -offset second (u = 0) — geometry.mjs order.
 * `stations` is ribbonGeometry's own station count.
 */
export function ribbonGradientColors(stations, spec, shade = 1) {
  const out = new Float32Array(Math.max(0, stations) * 2 * 3);
  if (!spec || stations < 1) return out;
  for (let i = 0; i < stations; i++) {
    const t = stations > 1 ? i / (stations - 1) : 0;
    pushGray(out, i * 6, spec, gradientCoordinate(t, 1, spec.angleDeg), shade);
    pushGray(out, i * 6 + 3, spec, gradientCoordinate(t, 0, spec.angleDeg), shade);
  }
  return out;
}

/**
 * Vertex colors for a skirtGeometry result: side-major layout —
 * side +1 (u = 1) first, then side -1 (u = 0); per station a
 * bottom then a top vertex, both at the station's t. `stations`
 * is the station count of the matching ribbonGeometry (same
 * smoothed path). Shade defaults to the standing skirt factor.
 */
export function skirtGradientColors(stations, spec, shade = 0.38) {
  const out = new Float32Array(Math.max(0, stations) * 4 * 3);
  if (!spec || stations < 1) return out;
  let o = 0;
  for (const u of [1, 0]) {
    for (let i = 0; i < stations; i++) {
      const t = stations > 1 ? i / (stations - 1) : 0;
      const s = gradientCoordinate(t, u, spec.angleDeg);
      pushGray(out, o, spec, s, shade); o += 3;
      pushGray(out, o, spec, s, shade); o += 3;
    }
  }
  return out;
}

/**
 * Vehicle-class gradient specs (REQ-V-6, buses): the fallback
 * identity for a vehicle whose route token is unavailable, and
 * the designed stale state. Resolved vehicles normally draw
 * their ROUTE's token; these are per-class, keyed by feed id.
 */
function classSpec(id, from, to, angleDeg = 90) {
  return Object.freeze({
    id, from, to, angleDeg,
    css: `linear-gradient(${angleDeg}deg, ${grayCss(from)}, ${grayCss(to)})`,
    midCss: grayCss((from + to) / 2),
  });
}
export const VEHICLE_CLASS_GRADIENTS = Object.freeze({
  ddot: classSpec('VC-ddot', 0xf0, 0x4d),
  smart: classSpec('VC-smart', 0xdb, 0x26),
  qline: classSpec('VC-qline', 0xc7, 0x38),
  stale: classSpec('VC-stale', 0x8a, 0x61),
  unassigned: classSpec('VC-unassigned', 0xb3, 0xb3),
});
/** Class spec for a feed id ('ddot' | 'smart' | 'qline' |
 *  'stale' | 'unassigned'); null when the feed is unknown. */
export function vehicleClassGradient(feed) {
  return VEHICLE_CLASS_GRADIENTS[feed] || null;
}

/**
 * REQ-V-7 layer-opacity tokens. Defaults = the V1-derived
 * renderer's shipped values (first paint unchanged): streets
 * 0.9 and water 0.85 / water-lines 0.5 were the standing material
 * opacities; routes, vehicles, and stops shipped fully opaque.
 */
export const LAYER_OPACITY = Object.freeze({
  routes: 1,
  vehicles: 1,
  stops: 1,
  streets: 0.9,
  water: 0.85,
  waterLines: 0.5,
});
