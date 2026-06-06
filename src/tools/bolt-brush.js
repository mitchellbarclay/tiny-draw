import state from '../state.js';

// --- Lightning bolt ---------------------------------------------------------
// Model: a bolt is ONE continuous stroke (the path you draw) with a jagged
// perpendicular *displacement* laid on top. While you draw, the displacement
// shimmers; when you stop moving it progressively settles to a standstill. The
// whole thing lives on the overlay until you release, then it bakes to the main
// canvas exactly once. There are no baked mid-stroke "segments", so there are
// no seams to mis-connect, and the only per-frame cost is re-stroking one path.

// --- Tuning -----------------------------------------------------------------
var SKEL_STEP = 5;        // path resample step (px) — small, so curves survive
function jagAmp() { return Math.max(12, state.brushSize * 1.8); } // jag size
var JAG_WL = 46;          // base jag wavelength (px); each octave halves it
var JAG_OCTAVES = 3;      // layers of detail: big bends + finer crackle
var MORPH_RATE = 0.0010;  // shimmer speed (noise units per ms while moving)
var SETTLE_MS = 500;      // after you stop moving, shimmer eases out over this
var CADENCE_MS = 33;      // throttle heavy rebuild/morph to ~30fps

// --- Coherent value noise ---------------------------------------------------
// 1D value noise in [-1,1], smooth and deterministic in both inputs. Sampling
// it at a slowly drifting phase gives a gentle shimmer; sampling the same arc
// position always returns the same base shape, so the bolt is stable in space.
function fract(x) { return x - Math.floor(x); }
function hash1(n, seed) { return fract(Math.sin(n*12.9898 + seed*78.233) * 43758.5453) * 2 - 1; }
function vnoise(u, seed) {
  var i = Math.floor(u), f = u - i, t = f*f*(3-2*f);
  return hash1(i, seed) + (hash1(i+1, seed) - hash1(i, seed)) * t;
}
// Perpendicular offset at arc length s, animation phase, and stroke seed.
// Multi-octave (fractal): big slow bends plus progressively finer crackle.
function jagOffset(s, phase, seed) {
  var o = 0, amp = jagAmp(), wl = JAG_WL, ph = phase;
  for (var k = 0; k < JAG_OCTAVES; k++) {
    o += amp * vnoise(s/wl + ph, seed + k*19.7);
    amp *= 0.5; wl *= 0.5; ph *= 1.8;
  }
  return o;
}

// --- Geometry ---------------------------------------------------------------
// Resample a polyline to evenly-spaced vertices `step` apart. Decouples the
// skeleton from how densely/sparsely the cursor recorded points.
function resamplePath(pts, step) {
  var out = [{x:pts[0].x, y:pts[0].y}];
  var px = pts[0].x, py = pts[0].y;
  var i = 1;
  while (i < pts.length) {
    var dx = pts[i].x-px, dy = pts[i].y-py;
    var d = Math.hypot(dx, dy);
    if (d < step) { px = pts[i].x; py = pts[i].y; i++; continue; }
    var t = step/d;
    px += dx*t; py += dy*t;
    out.push({x:px, y:py});
  }
  var last = pts[pts.length-1], lp = out[out.length-1];
  if (Math.hypot(last.x-lp.x, last.y-lp.y) > step*0.25) out.push({x:last.x, y:last.y});
  return out;
}

// Rebuild the cached skeleton (resampled path + per-vertex arc length).
function rebuildSkel(bs) {
  var pts = bs.pts;
  if (pts.length < 2) { bs.skel = null; bs.sArr = null; return; }
  var skel = resamplePath(pts, SKEL_STEP);
  if (skel.length < 2) skel = [{x:pts[0].x,y:pts[0].y}, {x:pts[pts.length-1].x,y:pts[pts.length-1].y}];
  var s = [0];
  for (var i = 1; i < skel.length; i++)
    s[i] = s[i-1] + Math.hypot(skel[i].x-skel[i-1].x, skel[i].y-skel[i-1].y);
  bs.skel = skel; bs.sArr = s;
}

// Displace every skeleton vertex perpendicular to its local tangent by the jag
// offset at that vertex's arc length and the current phase.
function buildShape(bs) {
  var skel = bs.skel, s = bs.sArr;
  if (!skel || skel.length < 2) return null;
  var out = [];
  for (var j = 0; j < skel.length; j++) {
    var a = skel[Math.max(0,j-1)], b = skel[Math.min(skel.length-1,j+1)];
    var tx = b.x-a.x, ty = b.y-a.y, tl = Math.hypot(tx,ty)||1;
    var nx = -ty/tl, ny = tx/tl;
    var o = jagOffset(s[j], bs.phase, bs.seed);
    out.push({x: skel[j].x + nx*o, y: skel[j].y + ny*o});
  }
  return out;
}

// --- Rendering --------------------------------------------------------------
// Neon glow via a few stacked translucent strokes (widest/faintest first) plus
// a hot white core. Deliberately NOT using ctx.filter='blur()' — that allocates
// an offscreen and gaussian-blurs the whole bbox every frame, which tanked the
// whole app. Stacked strokes are cheap and composite fine.
function renderBolt(ctx, pts, col) {
  if (!pts || pts.length < 2) return;
  var w = Math.max(2, state.brushSize*0.70);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  function trace() {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.14; ctx.lineWidth = w*2.8; trace(); ctx.stroke();
  ctx.globalAlpha = 0.26; ctx.lineWidth = w*1.8; trace(); ctx.stroke();
  ctx.globalAlpha = 0.55; ctx.lineWidth = w*1.0; trace(); ctx.stroke();
  ctx.globalAlpha = 1.0;  ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, w*0.42); trace(); ctx.stroke();
  ctx.restore();
}

// --- Per-frame animation ----------------------------------------------------
// Advance one stroke. Returns {changed, animating}: `changed` => the overlay
// needs a repaint this tick; `animating` => keep the rAF loop alive.
function advance(bs, now) {
  var idle = now - bs.lastMoveT;
  var animating = idle < SETTLE_MS;
  if (now - bs.procAt < CADENCE_MS) return {changed:false, animating:animating};
  var dt = Math.min(now - bs.procAt, 100);
  bs.procAt = now;

  var changed = false;
  if (bs.skelDirty) { rebuildSkel(bs); bs.skelDirty = false; changed = true; }

  var settle = Math.min(1, idle / SETTLE_MS); // 0 = moving, 1 = at rest
  if (settle < 1) { bs.phase += dt * MORPH_RATE * (1 - settle); changed = true; }

  if (changed || !bs.shape) bs.shape = buildShape(bs);
  return {changed:changed, animating: settle < 1};
}

function boltOverlayFrame() {
  var hasMain   = !!state.boltStroke;
  var hasMirror = state.mirrorMode && !!state.mirrorBoltStroke;
  if (!hasMain && !hasMirror) {
    state.ovCtx.clearRect(0,0,state.canvasW,state.canvasH);
    state.boltAnimFrame = null;
    return;
  }
  var now = performance.now();
  var changed = false, animating = false;
  if (hasMain)   { var a = advance(state.boltStroke, now);       changed = changed||a.changed; animating = animating||a.animating; }
  if (hasMirror) { var b = advance(state.mirrorBoltStroke, now); changed = changed||b.changed; animating = animating||b.animating; }
  if (changed) {
    state.ovCtx.clearRect(0,0,state.canvasW,state.canvasH);
    if (hasMain   && state.boltStroke.shape)       renderBolt(state.ovCtx, state.boltStroke.shape, state.boltStroke.col);
    if (hasMirror && state.mirrorBoltStroke.shape) renderBolt(state.ovCtx, state.mirrorBoltStroke.shape, state.mirrorBoltStroke.col);
  }
  // Once everything has settled we stop the loop entirely (0 CPU); the next
  // point added (drawBoltStroke) restarts it.
  state.boltAnimFrame = animating ? requestAnimationFrame(boltOverlayFrame) : null;
}

// --- Public API -------------------------------------------------------------
export function drawBoltStroke(x, y, col) {
  var now = performance.now();
  if (!state.boltStroke) {
    state.boltStroke = {
      pts: [{x:x, y:y}], col: col, seed: Math.random()*1000,
      phase: 0, lastMoveT: now, procAt: now - CADENCE_MS,
      skel: null, sArr: null, skelDirty: true, shape: null
    };
  } else {
    var bs = state.boltStroke;
    bs.col = col;
    bs.pts.push({x:x, y:y});
    bs.lastMoveT = now;
    bs.skelDirty = true;
  }
  if (!state.boltAnimFrame) state.boltAnimFrame = requestAnimationFrame(boltOverlayFrame);
}

// Bake the final bolt to the main canvas — reuse the shape currently on the
// overlay so the freeze is seamless; rebuild only if points arrived since.
function bakeStroke(bs) {
  if (!bs) return;
  if (bs.skelDirty || !bs.skel) rebuildSkel(bs);
  var shape = (bs.shape && !bs.skelDirty) ? bs.shape : buildShape(bs);
  if (shape) renderBolt(state.ctx, shape, bs.col);
}

export function finalizeBoltStroke() {
  if (state.boltStroke)       { bakeStroke(state.boltStroke);       state.boltStroke = null; }
  if (state.mirrorBoltStroke) { bakeStroke(state.mirrorBoltStroke); state.mirrorBoltStroke = null; }
  if (state.boltAnimFrame)    { cancelAnimationFrame(state.boltAnimFrame); state.boltAnimFrame = null; }
  state.ovCtx.clearRect(0, 0, state.canvasW, state.canvasH);
}
