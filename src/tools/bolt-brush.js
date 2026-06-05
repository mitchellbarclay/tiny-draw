import state from '../state.js';

// --- Tuning -----------------------------------------------------------------
// A bolt stroke is now one continuous recorded path. Each point carries a
// timestamp; once a point is older than LIFE_MS it "expires" out of the live
// animated tail and bakes into permanent ink. This means:
//   * the live tail follows every recorded point (no chord-gap on fast flicks),
//   * the animation settles on its own a moment after you stop moving,
//   * and it always bakes fully on release (never crackles forever).
var LIFE_MS = 520;        // how long a point stays in the live, animated tail
var CRACKLE_MS = 70;      // regenerate the live fractal at most this often (flicker)

function bakeMinLen() { return Math.max(70, state.brushSize * 6); }

// Jag tuning. The bolt is built in two independent layers (see buildBolt):
//   SKEL_STEP — how finely we follow the *drawn* path. Small, so curves survive.
//   jagAmp()  — primary perpendicular jag amplitude (fixed spatial scale, tied
//               to brush size, never to cursor speed).
//   JAG_WL    — base jag wavelength in px; each octave halves it for finer detail.
//   MORPH_RATE— how fast the live bolt shimmers over time. The jag is *coherent*
//               value noise (not fresh randomness each tick), so the bolt holds
//               its shape and morphs smoothly instead of teleporting — that's
//               what keeps the animation calm rather than erratic.
var SKEL_STEP = 5;
function jagAmp() { return Math.max(12, state.brushSize * 1.8); }
var JAG_WL = 46;
var JAG_OCTAVES = 3;
var MORPH_RATE = 0.0010;

// 1D value noise in [-1,1]: smooth, deterministic, continuous in both its
// position and seed inputs. Continuity is the whole point — sampling it at a
// slowly drifting phase gives a gentle shimmer, and sampling the same arc-length
// position always returns the same base shape (so the bolt is stable in space).
function fract(x) { return x - Math.floor(x); }
function hash1(n, seed) { return fract(Math.sin(n*12.9898 + seed*78.233) * 43758.5453) * 2 - 1; }
function vnoise(u, seed) {
  var i = Math.floor(u), f = u - i, t = f*f*(3-2*f);
  return hash1(i, seed) + (hash1(i+1, seed) - hash1(i, seed)) * t;
}
// Perpendicular offset at arc-length s and time ms for a given stroke seed.
// Multi-octave (fractal): big slow bends + progressively finer, faster crackle.
function jagOffset(s, ms, seed) {
  var o = 0, amp = jagAmp(), wl = JAG_WL, phase = ms * MORPH_RATE;
  for (var k = 0; k < JAG_OCTAVES; k++) {
    o += amp * vnoise(s/wl + phase, seed + k*19.7);
    amp *= 0.5; wl *= 0.5; phase *= 1.8;
  }
  return o;
}

// --- Drawing primitives -----------------------------------------------------
function drawBoltPath(targetCtx, pts, col, lineWidth, alpha) {
  targetCtx.save();
  targetCtx.strokeStyle = col; targetCtx.lineWidth = lineWidth;
  targetCtx.lineCap = 'round'; targetCtx.lineJoin = 'round';
  targetCtx.globalAlpha = alpha;
  targetCtx.beginPath(); targetCtx.moveTo(pts[0].x, pts[0].y);
  for (var i = 1; i < pts.length; i++) targetCtx.lineTo(pts[i].x, pts[i].y);
  targetCtx.stroke(); targetCtx.restore();
}

function strokeBoltGlow(targetCtx, pts, col, w) {
  var blurPx = Math.max(2, state.brushSize * 0.35);
  targetCtx.save();
  targetCtx.filter = 'blur(' + blurPx + 'px)';
  targetCtx.strokeStyle = col; targetCtx.lineWidth = w * 1.4;
  targetCtx.lineCap = 'round'; targetCtx.lineJoin = 'round';
  targetCtx.globalAlpha = 0.9;
  targetCtx.beginPath(); targetCtx.moveTo(pts[0].x, pts[0].y);
  for (var i = 1; i < pts.length; i++) targetCtx.lineTo(pts[i].x, pts[i].y);
  targetCtx.stroke(); targetCtx.restore();
}

// Resample a polyline down to evenly-spaced vertices `step` apart. The recorded
// mousemove points cluster tightly when you draw slowly and spread out when you
// draw fast; resampling to a fixed spatial step decouples the zig-zag from
// cursor speed entirely.
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
    out.push({x:px, y:py}); // stay on segment i, keep stepping along it
  }
  var last = pts[pts.length-1], lp = out[out.length-1];
  if (Math.hypot(last.x-lp.x, last.y-lp.y) > step*0.25) out.push({x:last.x, y:last.y});
  return out;
}

// Build the lightning in two independent layers so curve fidelity and jag scale
// don't fight each other:
//   1. SKELETON — fine-resample the recorded points [from..to] (SKEL_STEP).
//      This faithfully follows whatever you draw, curves included; no coarse
//      chords.
//   2. JAG — push every skeleton vertex sideways by jagOffset() sampled at its
//      *global* arc length (baseArc + distance along this sub-path) and time ms.
//      Using global arc length + a per-stroke seed means a given physical point
//      always jags the same way, so a baked chunk and the live tail line up, and
//      baking at the same ms reproduces exactly what was on screen.
function buildBolt(pts, from, to, ms, seed, baseArc) {
  var sub = [];
  for (var i = from; i <= to; i++) sub.push(pts[i]);
  if (sub.length < 2) return null;
  var skel = resamplePath(sub, SKEL_STEP);
  if (skel.length < 2) skel = [{x:sub[0].x,y:sub[0].y}, {x:sub[sub.length-1].x,y:sub[sub.length-1].y}];

  var out = [];
  var s = baseArc;
  for (var j = 0; j < skel.length; j++) {
    if (j > 0) s += Math.hypot(skel[j].x-skel[j-1].x, skel[j].y-skel[j-1].y);
    var a = skel[Math.max(0,j-1)], b = skel[Math.min(skel.length-1,j+1)];
    var tx = b.x-a.x, ty = b.y-a.y, tl = Math.hypot(tx,ty)||1;
    var nx = -ty/tl, ny = tx/tl;
    var o = jagOffset(s, ms, seed);
    out.push({x: skel[j].x + nx*o, y: skel[j].y + ny*o});
  }
  return out;
}

function renderBolt(targetCtx, jaggedPts, col) {
  if (!jaggedPts || jaggedPts.length < 2) return;
  var w = Math.max(2, state.brushSize*0.70);
  strokeBoltGlow(targetCtx, jaggedPts, col, w);
  drawBoltPath(targetCtx, jaggedPts, '#fff', Math.max(1, w*0.40), 0.95);
}

// --- Per-stroke processing --------------------------------------------------
function pathLen(pts, from, to) {
  var L = 0;
  for (var j = from; j < to; j++) L += Math.hypot(pts[j+1].x-pts[j].x, pts[j+1].y-pts[j].y);
  return L;
}

// Advance baking + decide whether this stroke's live shape needs redrawing.
// Returns true if anything changed (a chunk baked, or the crackle shape
// regenerated) so the caller knows whether to repaint the overlay. The actual
// (expensive, blurred) draw is deferred to renderStroke so we only pay for it
// when something actually changed — not on every 60fps frame.
function advanceStroke(bs, now) {
  var n = bs.pts.length;
  if (n < 2) return false;
  var changed = false;

  // How far has the expired (older than LIFE_MS) region grown past what we've
  // already baked? expireIdx is the last contiguous expired index.
  var expireIdx = bs.bakedThrough;
  for (var k = bs.bakedThrough+1; k < n; k++) {
    if (now - bs.pts[k].t > LIFE_MS) expireIdx = k; else break;
  }
  var idle = now - bs.pts[n-1].t; // time since the cursor last moved
  if (expireIdx > bs.bakedThrough) {
    var regionLen = pathLen(bs.pts, bs.bakedThrough, expireIdx);
    if (idle > LIFE_MS) {
      // SETTLE: the cursor has stopped. Bake *exactly* the shape currently on the
      // overlay (reuse bs.liveShape) so the freeze into permanent ink is
      // seamless — no snap to a different random shape. Then clear the tail.
      var settle = bs.liveShape || buildBolt(bs.pts, bs.bakedThrough, n-1, now, bs.seed, bs.bakedArc);
      renderBolt(state.ctx, settle, bs.col);
      bs.bakedArc += pathLen(bs.pts, bs.bakedThrough, n-1);
      bs.bakedThrough = n-1;
      bs.liveShape = null;
      return true;
    } else if (regionLen >= bakeMinLen()) {
      // Mid-stroke chunk bake to cap the live tail length (perf). Seams here are
      // masked by the moving cursor. Built at the same arc length + ms as the
      // live tail, so it lines up.
      var chunk = buildBolt(bs.pts, bs.bakedThrough, expireIdx, now, bs.seed, bs.bakedArc);
      renderBolt(state.ctx, chunk, bs.col);
      bs.bakedArc += pathLen(bs.pts, bs.bakedThrough, expireIdx);
      bs.bakedThrough = expireIdx;
      changed = true;
    }
  }

  // Live tail: everything not yet baked. Rebuilt on the CRACKLE_MS cadence — but
  // because jagOffset is coherent value noise drifting on `now`, each rebuild is
  // a small smooth change, not a fresh random teleport.
  var tail = bs.pts.slice(bs.bakedThrough);
  if (tail.length >= 2) {
    if (!bs.liveShape || (now - bs.liveAt) >= CRACKLE_MS || bs.liveCount !== tail.length) {
      bs.liveShape = buildBolt(bs.pts, bs.bakedThrough, n-1, now, bs.seed, bs.bakedArc);
      bs.liveAt = now;
      bs.liveCount = tail.length;
      changed = true;
    }
  } else if (bs.liveShape) {
    bs.liveShape = null; // tail fully baked away — clear the overlay remnant
    changed = true;
  }
  return changed;
}

function renderStroke(bs) {
  if (bs.liveShape) renderBolt(state.ovCtx, bs.liveShape, bs.col);
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
  // Advance both strokes first; only repaint the overlay (the costly blurred
  // pass) when a shape actually changed this tick.
  var changed = false;
  if (state.boltStroke) changed = advanceStroke(state.boltStroke, now) || changed;
  if (hasMirror)        changed = advanceStroke(state.mirrorBoltStroke, now) || changed;
  if (changed) {
    state.ovCtx.clearRect(0,0,state.canvasW,state.canvasH);
    if (state.boltStroke) renderStroke(state.boltStroke);
    if (hasMirror)        renderStroke(state.mirrorBoltStroke);
  }
  state.boltAnimFrame = requestAnimationFrame(boltOverlayFrame);
}

// --- Public API -------------------------------------------------------------
export function drawBoltStroke(x, y, col) {
  if (!state.boltStroke) {
    state.boltStroke = {pts:[{x:x, y:y, t:performance.now()}], col:col, bakedThrough:0, bakedArc:0, seed:Math.random()*1000, liveShape:null, liveAt:0, liveCount:0};
  } else {
    var bs = state.boltStroke;
    bs.col = col;
    bs.pts.push({x:x, y:y, t:performance.now()});
  }
  // One shared animation loop drives both the main and mirror tails; the guard
  // keeps the mirror pass from starting a second, uncancellable loop.
  if (!state.boltAnimFrame) state.boltAnimFrame = requestAnimationFrame(boltOverlayFrame);
}

function bakeRemaining(bs) {
  if (!bs) return;
  if (bs.bakedThrough < bs.pts.length - 1) {
    // Reuse the live shape if we have it so release freezes exactly what's shown.
    var shape = bs.liveShape || buildBolt(bs.pts, bs.bakedThrough, bs.pts.length-1, performance.now(), bs.seed, bs.bakedArc);
    renderBolt(state.ctx, shape, bs.col);
    bs.bakedThrough = bs.pts.length - 1;
  }
}

export function finalizeBoltStroke() {
  if (state.boltStroke) { bakeRemaining(state.boltStroke); state.boltStroke = null; }
  if (state.mirrorBoltStroke) { bakeRemaining(state.mirrorBoltStroke); state.mirrorBoltStroke = null; }
  if (state.boltAnimFrame) { cancelAnimationFrame(state.boltAnimFrame); state.boltAnimFrame = null; }
  state.ovCtx.clearRect(0, 0, state.canvasW, state.canvasH);
}
