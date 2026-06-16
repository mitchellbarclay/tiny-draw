// Splash ambient — a "screensaver" that draws the app's real brushes behind the
// splash content, then gently fades them out so the title/buttons stay readable.
//
// How it works: every brush in the app funnels through drawStroke() and renders
// onto the shared singleton `state` (state.ctx / state.ovCtx + the per-tool rAF
// loops). While the splash is up the user can't draw, so `state` is idle and
// borrowable: we point state.ctx/ovCtx at a pair of hidden splash canvases, run
// an autopilot that synthesizes pointer paths and calls the real drawStroke(),
// then on dismiss we cancel every in-flight brush loop and restore the real
// refs. The art is therefore literally the app's brushes — fire really
// flickers, flowers really bloom — not a lookalike.
//
// Readability is handled three ways (the "soft glow + global fade" approach):
//   1. A continuous destination-out fade dissolves committed strokes back to the
//      cyan background, so the canvas never saturates into noise.
//   2. A radial glow element (#splash-glow) sits behind the centered text.
//   3. Stroke paths are softly steered away from the central text band.

import state from '../state.js';
import { applyResize } from '../core/canvas-setup.js';
import { drawStroke } from '../tools/draw-stroke.js';
import { commitAllSplatterParticles } from '../tools/bubble-brush.js';
import { finalizeVineStrokeV2 } from '../tools/vine-brush-v2.js';
import { finalizeFlowerStroke } from '../tools/flower-brush.js';
import { finalizeBoltStroke } from '../tools/bolt-brush.js';
import { finalizeFireStroke } from '../tools/fire-brush.js';
import { finalizePipeStroke } from '../tools/pipes-brush.js';

// ── Tuning ──────────────────────────────────────────────────────────────────
// Fade is intentionally slow: strokes are drawn one at a time, so the only way
// to get several different brushes on screen together (the whole point — showing
// variety) is to let each linger ~15-25s while new ones arrive. The glow + soft
// centre-avoidance keep the text readable even as the scene fills in.
var FADE_ALPHA   = 0.0026;  // per-frame destination-out — tuned so ~8-10 strokes coexist at steady state
var SAMPLE_STEP  = 5;       // px between path samples
var PTS_PER_FRAME = 2;      // samples emitted per frame (≈ 600 px/s stroke speed)
var GAP_MS       = 280;     // pause between strokes
var LAYER_ALPHA  = 0.8;     // overall opacity of the ambient layer (CSS)

// A cheerful pastel palette that reads against the #c9effb splash background.
var PALETTE = ['#ff8fb4', '#ffd166', '#7ed957', '#5ec8ff', '#b08bff', '#ff9e7a', '#5fd6c4'];
var FIRE_COLORS = ['#ff7a18', '#ff5252', '#ffb020', '#ff6a00'];
var VINE_COLORS = ['#3fbf5f', '#5fae3a', '#2fa36b', '#57b94a'];
var FLOWER_COLORS = ['#ff6fae', '#ff8fb1', '#ffd24d', '#b06fff', '#ff7a7a'];
var BOLT_COLORS = ['#ffd83b', '#5cc8ff', '#b06fff', '#7ad0ff'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(a, b) { return a + Math.random() * (b - a); }

// Per-tool recipes: brush size, colour source, and how the wandering path looks.
var RECIPES = [
  { tool: 'pencil',  size: function () { return rand(16, 30); }, color: function () { return pick(PALETTE); },       lenMul: rand, curvy: 0.16 },
  { tool: 'vine',    size: function () { return rand(20, 34); }, color: function () { return pick(VINE_COLORS); },   curvy: 0.20 },
  { tool: 'flower',  size: function () { return rand(20, 32); }, color: function () { return pick(FLOWER_COLORS); }, curvy: 0.22 },
  { tool: 'fire',    size: function () { return rand(22, 34); }, color: function () { return pick(FIRE_COLORS); },   curvy: 0.10 },
  { tool: 'bolt',    size: function () { return rand(16, 26); }, color: function () { return pick(BOLT_COLORS); },   curvy: 0.08 },
  { tool: 'splatter',size: function () { return rand(24, 38); }, color: function () { return pick(PALETTE); },       curvy: 0.18 },
  { tool: 'pipe',    size: function () { return rand(26, 40); }, color: function () { return pick(PALETTE); },       curvy: 0.14 },
];

// ── Lifecycle ─────────────────────────────────────────────────────────────--
var running = false;
var rafId = null;
var bgCanvas = null, ovCanvas = null;
var saved = null;          // snapshot of borrowed state fields
var queue = [];            // shuffled recipe queue for even variety
var cur = null;            // current playback: { samples, idx, recipe }
var mode = 'idle';         // 'drawing' | 'gap'
var gapUntil = 0;

function makeCanvas(splash, z) {
  var c = document.createElement('canvas');
  var cssW = splash.clientWidth, cssH = splash.clientHeight;
  c.width = cssW * state.DPR; c.height = cssH * state.DPR;
  c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:' + z + ';';
  if (z === 1) c.style.opacity = LAYER_ALPHA;
  var ctx = c.getContext('2d');
  ctx.scale(state.DPR, state.DPR);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  splash.appendChild(c);
  return { canvas: c, ctx: ctx, w: cssW, h: cssH };
}

export function startSplashAmbient(splash) {
  if (running || !splash) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var bg = makeCanvas(splash, 1);
  var ov = makeCanvas(splash, 2);
  bgCanvas = bg.canvas; ovCanvas = ov.canvas;

  // Borrow the shared state. Snapshot everything we touch so dismiss() can
  // restore the app to a pristine, idle state.
  saved = {
    ctx: state.ctx, ovCtx: state.ovCtx, canvasW: state.canvasW, canvasH: state.canvasH,
    tool: state.tool, color: state.color, brushSize: state.brushSize,
    lastX: state.lastX, lastY: state.lastY, painting: state.painting,
    mirrorMode: state.mirrorMode, rainbowMode: state.rainbowMode,
  };
  state.ctx = bg.ctx; state.ovCtx = ov.ctx;
  state.canvasW = bg.w; state.canvasH = bg.h;
  state.mirrorMode = false; state.rainbowMode = false; state.painting = false;
  state.splashAmbient = true; // suspend the app's resize handlers while borrowed

  running = true;
  mode = 'gap'; gapUntil = 0; queue = [];
  rafId = requestAnimationFrame(frame);

  window.addEventListener('resize', onResize);
}

export function stopSplashAmbient() {
  if (!running) return;
  running = false;
  window.removeEventListener('resize', onResize);
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

  // Flush and hard-reset every brush so no orphaned rAF loop can paint onto the
  // real canvas after we restore state.ctx below.
  resetBrushes();

  // Restore the borrowed state fields exactly.
  if (saved) {
    state.ctx = saved.ctx; state.ovCtx = saved.ovCtx;
    state.canvasW = saved.canvasW; state.canvasH = saved.canvasH;
    state.tool = saved.tool; state.color = saved.color; state.brushSize = saved.brushSize;
    state.lastX = saved.lastX; state.lastY = saved.lastY; state.painting = saved.painting;
    state.mirrorMode = saved.mirrorMode; state.rainbowMode = saved.rainbowMode;
    saved = null;
  }

  if (bgCanvas) { bgCanvas.remove(); bgCanvas = null; }
  if (ovCanvas) { ovCanvas.remove(); ovCanvas = null; }
  cur = null; mode = 'idle';

  // Re-enable the app's resize path and sync the real canvas to the current
  // viewport (a no-op if the window didn't change while the splash was up).
  state.splashAmbient = false;
  applyResize();
}

function onResize() {
  // Splash canvases are sized to the viewport; on a resize the cleanest thing is
  // to tear down (which restores state so the app's own resize handler operates
  // on the real canvas) and rebuild against the new dimensions.
  var splash = document.getElementById('splash-screen');
  stopSplashAmbient();
  if (splash && !splash.classList.contains('hiding')) {
    setTimeout(function () {
      if (splash.isConnected && !splash.classList.contains('hiding')) startSplashAmbient(splash);
    }, 260);
  }
}

// ── Brush cleanup ─────────────────────────────────────────────────────────--
// End the current stroke the same way main.js's mouseup does (commits grow-in
// animations to the canvas). Idempotent when no stroke is in flight.
function endStroke() {
  state.painting = false;
  finalizeVineStrokeV2(); finalizeFlowerStroke(); finalizeBoltStroke();
  finalizeFireStroke(); finalizePipeStroke(); commitAllSplatterParticles();
}

// Cancel every per-tool animation frame and clear all transient buffers, so the
// shared state is genuinely idle before we hand it back.
function resetBrushes() {
  endStroke();
  ['splatterAnimId', 'boltAnimFrame', 'rectAnimFrame', 'ellipseAnimFrame',
   'vineAnimFrame', 'pipeAnimFrame', 'flowerAnimFrame', 'fireAnimFrame',
   'threeAnimFrame'].forEach(function (k) {
    if (state[k]) { cancelAnimationFrame(state[k]); state[k] = null; }
  });
  state.splatterParticles = [];
  state.fireLiveStamps = [];
  state.flowerLiveBlossoms = [];
  state.vineLiveLeaves = [];
  state.boltStroke = state.mirrorBoltStroke = null;
  state.vineStrokeV2 = state.mirrorVineStrokeV2 = null;
  state.flowerStroke = state.mirrorFlowerStroke = null;
  state.pipeStroke = state.mirrorPipeStroke = null;
  state.fireHasPrev = false; state.fireVelX = 0; state.fireVelY = 0; state.fireDistAcc = 0;
}

// ── Path generation ───────────────────────────────────────────────────────--
// A gentle wandering polyline that bounces off the margins and is softly steered
// away from the central text band.
function buildPath(curvy) {
  var W = state.canvasW, H = state.canvasH;
  var margin = 44;
  var cx = W / 2, cy = H / 2;
  var avoidRx = W * 0.34, avoidRy = H * 0.30; // soft text-protection ellipse

  var x = rand(margin, W - margin), y = rand(margin, H - margin);
  var ang = rand(0, Math.PI * 2);
  var seg = 26;
  var total = Math.min(W, H) * rand(0.9, 1.8);
  var verts = [{ x: x, y: y }];
  var dist = 0, turn = rand(curvy * 0.4, curvy) * (Math.random() < 0.5 ? 1 : -1);

  while (dist < total) {
    ang += turn + (Math.random() - 0.5) * 0.12;

    // Soft outward steer when inside the protected ellipse around the text.
    var ex = (x - cx) / avoidRx, ey = (y - cy) / avoidRy;
    var er = ex * ex + ey * ey;
    if (er < 1) {
      var outAng = Math.atan2(y - cy, x - cx);
      var pull = (1 - er) * 1.15;
      ang = ang + Math.sin(outAng - ang) * pull;
    }

    x += Math.cos(ang) * seg; y += Math.sin(ang) * seg;
    if (x < margin || x > W - margin) { ang = Math.PI - ang; x = Math.max(margin, Math.min(W - margin, x)); }
    if (y < margin || y > H - margin) { ang = -ang; y = Math.max(margin, Math.min(H - margin, y)); }
    verts.push({ x: x, y: y });
    dist += seg;
  }
  return verts;
}

// Resample a polyline into points evenly spaced by SAMPLE_STEP px.
function densify(verts) {
  var out = [verts[0]];
  var carry = 0;
  for (var i = 1; i < verts.length; i++) {
    var a = verts[i - 1], b = verts[i];
    var dx = b.x - a.x, dy = b.y - a.y, segLen = Math.hypot(dx, dy);
    if (segLen < 1e-6) continue;
    var d = SAMPLE_STEP - carry;
    while (d <= segLen) {
      var t = d / segLen;
      out.push({ x: a.x + dx * t, y: a.y + dy * t });
      d += SAMPLE_STEP;
    }
    carry = segLen - (d - SAMPLE_STEP);
  }
  return out;
}

function nextRecipe() {
  if (!queue.length) {
    queue = RECIPES.slice();
    for (var i = queue.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = queue[i]; queue[i] = queue[j]; queue[j] = t; }
  }
  return queue.pop();
}

function beginStroke() {
  var recipe = nextRecipe();
  var samples = densify(buildPath(recipe.curvy));
  if (samples.length < 2) { mode = 'gap'; gapUntil = performance.now(); return; }

  state.tool = recipe.tool;
  state.color = recipe.color();
  state.brushSize = recipe.size();
  // Mirror what main.js's mousedown sets up for a fresh stroke.
  state.mirrorBoltStroke = state.mirrorVineStrokeV2 = null;
  state.mirrorFlowerStroke = state.mirrorPipeStroke = null;
  state.splatterGateX = null; state.splatterGateY = null;
  commitAllSplatterParticles();

  var p0 = samples[0];
  state.lastX = p0.x; state.lastY = p0.y;
  state.painting = true;
  drawStroke(p0.x, p0.y);

  cur = { samples: samples, idx: 1, recipe: recipe };
  mode = 'drawing';
}

// ── Master loop ───────────────────────────────────────────────────────────--
function fadeStep() {
  var ctx = state.ctx;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = FADE_ALPHA;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, state.canvasW, state.canvasH);
  ctx.restore();
}

function frame(now) {
  if (!running) return;
  fadeStep();

  if (mode === 'drawing' && cur) {
    for (var k = 0; k < PTS_PER_FRAME && cur && cur.idx < cur.samples.length; k++) {
      var p = cur.samples[cur.idx];
      drawStroke(p.x, p.y);
      state.lastX = p.x; state.lastY = p.y;
      cur.idx++;
    }
    if (cur && cur.idx >= cur.samples.length) {
      endStroke();
      cur = null;
      mode = 'gap';
      gapUntil = now + GAP_MS;
    }
  } else if (mode === 'gap') {
    if (now >= gapUntil) beginStroke();
  }

  rafId = requestAnimationFrame(frame);
}
