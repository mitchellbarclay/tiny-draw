import state from '../state.js';
import { adjacentColor, shadeColor } from '../core/color-utils.js';

var GROW_DURATION = 220; // ms per leaf grow-in

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Leaf object fields used by drawLeaf (all set at spawn, never mutated):
//   dx, dy      — normalised growth direction
//   len         — total length
//   squat       — width-to-length ratio
//   peakT       — where the leaf is widest (0–1 along length)
//   asym        — left/right bulge asymmetry (–0.5..+0.5)
//   fillColor   — base fill colour
//   rimColor    — midrib and edge colour
//
// Caller must ctx.translate(cx, cy) and set ctx.globalAlpha before calling.
function drawLeaf(ctx, leaf) {
  ctx.save();

  var dx = leaf.dx, dy = leaf.dy;
  var len = leaf.len;
  var halfW = len * leaf.squat * 0.5;
  var px = -dy, py = dx;
  var pt = leaf.peakT;
  var al = leaf.asym;
  var lhw = halfW * (1 + al); // left-side bulge
  var rhw = halfW * (1 - al); // right-side bulge
  var baseAlpha = ctx.globalAlpha;

  function leafPath(ox, oy, l, lw, rw) {
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.bezierCurveTo(
      ox + dx * l * 0.10 - px * lw * 0.55, oy + dy * l * 0.10 - py * lw * 0.55,
      ox + dx * l * pt   - px * lw,         oy + dy * l * pt   - py * lw,
      ox + dx * l,                           oy + dy * l
    );
    ctx.bezierCurveTo(
      ox + dx * l * pt   + px * rw,         oy + dy * l * pt   + py * rw,
      ox + dx * l * 0.10 + px * rw * 0.55,  oy + dy * l * 0.10 + py * rw * 0.55,
      ox, oy
    );
    ctx.closePath();
  }

  function mainPath() { leafPath(0, 0, len, lhw, rhw); }

  // Gradient fill: richer/darker at base, lighter at tip
  var grad = ctx.createLinearGradient(0, 0, dx * len, dy * len);
  grad.addColorStop(0.00, shadeColor(leaf.fillColor, -0.12, +5));
  grad.addColorStop(0.45, leaf.fillColor);
  grad.addColorStop(1.00, shadeColor(leaf.fillColor, +0.22, -8));

  mainPath();
  ctx.fillStyle = grad;
  ctx.globalAlpha = baseAlpha;
  ctx.fill();

  function hiPath() {
    var hl = len * 0.65, hhw = halfW * 0.40;
    leafPath(px * halfW * 0.22, py * halfW * 0.22, hl, hhw, hhw);
  }
  hiPath();
  ctx.fillStyle = shadeColor(leaf.fillColor, +0.28, -6);
  ctx.globalAlpha = baseAlpha * 0.30;
  ctx.fill();

  // Midrib — curves gently toward the heavier side
  var mCtrlX = dx * len * 0.48 - px * halfW * al * 0.22;
  var mCtrlY = dy * len * 0.48 - py * halfW * al * 0.22;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(mCtrlX, mCtrlY, dx * len * 0.86, dy * len * 0.86);
  ctx.strokeStyle = leaf.rimColor;
  ctx.lineWidth = Math.max(0.5, len * 0.026);
  ctx.lineCap = 'round';
  ctx.globalAlpha = baseAlpha * 0.32;
  ctx.stroke();

  ctx.restore();
}

function commitLeaf(ctx, leaf) {
  ctx.save();
  ctx.translate(leaf.cx, leaf.cy);
  ctx.globalAlpha = leaf.alpha;
  drawLeaf(ctx, leaf);
  ctx.restore();
}

// Draw the complete stem for a stroke state object as a single path — no per-segment
// calls means no overlapping round caps and no rib/joint artifacts at joins.
function drawStemPath(ctx, st) {
  var pts = st.points;
  if (!pts || pts.length < 2) return;

  // World-space vertical gradient: lit from top regardless of stroke direction.
  var minY = Infinity, maxY = -Infinity;
  for (var i = 0; i < pts.length; i++) {
    if (pts[i].y < minY) minY = pts[i].y;
    if (pts[i].y > maxY) maxY = pts[i].y;
  }
  var hw = st.stemW * 0.5;
  minY -= hw; maxY += hw;
  if (maxY - minY < 1) maxY = minY + 1;

  var grad = ctx.createLinearGradient(0, minY, 0, maxY);
  grad.addColorStop(0.00, st.stemHi);
  grad.addColorStop(0.35, st.col);
  grad.addColorStop(1.00, st.stemDark);

  // Midpoint-quadratic: move to pt[0], line to first midpoint, then quadratic
  // through each control point to the next midpoint, line to last pt. Single
  // beginPath/stroke means the canvas treats the whole thing as one shape.
  ctx.save();
  ctx.beginPath();

  var mid0x = (pts[0].x + pts[1].x) * 0.5;
  var mid0y = (pts[0].y + pts[1].y) * 0.5;
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(mid0x, mid0y);

  for (var i = 1; i < pts.length - 1; i++) {
    var midX = (pts[i].x + pts[i + 1].x) * 0.5;
    var midY = (pts[i].y + pts[i + 1].y) * 0.5;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);

  ctx.lineWidth   = st.stemW;
  ctx.strokeStyle = grad;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.globalAlpha = 1.0;
  ctx.stroke();
  ctx.restore();
}

function vineOverlayFrame() {
  var hasStem = (state.vineStrokeV2 && state.vineStrokeV2.points.length >= 2) ||
                (state.mirrorVineStrokeV2 && state.mirrorVineStrokeV2.points.length >= 2);
  var hasLeaves = state.vineLiveLeaves.length > 0 || state.vineFullLeaves.length > 0;

  if (!hasStem && !hasLeaves) {
    state.ovCtx.clearRect(0, 0, state.canvasW, state.canvasH);
    state.vineAnimFrame = null;
    return;
  }

  var now = performance.now();
  state.ovCtx.clearRect(0, 0, state.canvasW, state.canvasH);

  // Draw stems (single path each = no ribs)
  if (state.vineStrokeV2) drawStemPath(state.ovCtx, state.vineStrokeV2);
  if (state.mirrorVineStrokeV2) drawStemPath(state.ovCtx, state.mirrorVineStrokeV2);

  // Draw fully-grown leaves on overlay (committed to main canvas on finalize)
  state.vineFullLeaves.forEach(function(leaf) {
    state.ovCtx.save();
    state.ovCtx.translate(leaf.cx, leaf.cy);
    state.ovCtx.globalAlpha = leaf.alpha;
    drawLeaf(state.ovCtx, leaf);
    state.ovCtx.restore();
  });

  // Animate growing leaves; graduate done ones to vineFullLeaves
  state.vineLiveLeaves = state.vineLiveLeaves.filter(function(leaf) {
    var t = Math.min(1, (now - leaf.born) / leaf.growDuration);
    var scale = easeOut(t);

    if (t >= 1) {
      state.vineFullLeaves.push(leaf);
      return false;
    }

    state.ovCtx.save();
    state.ovCtx.translate(leaf.cx, leaf.cy);
    state.ovCtx.scale(scale, scale);
    state.ovCtx.globalAlpha = leaf.alpha * (0.35 + 0.65 * t);
    drawLeaf(state.ovCtx, leaf);
    state.ovCtx.restore();

    return true;
  });

  state.vineAnimFrame = requestAnimationFrame(vineOverlayFrame);
}

export function drawVineStrokeV2(x, y, col) {
  if (!state.vineStrokeV2) {
    var leafBase = Math.max(22, state.brushSize * 0.95);
    var stemW    = Math.max(2, state.brushSize * 0.38);
    state.vineStrokeV2 = {
      points:          [{x: state.lastX, y: state.lastY}],
      lx: state.lastX, ly: state.lastY,
      dir: null,
      stemDist:        0,
      accumLeaf:       0,
      side:            1,
      phase:           Math.random() * Math.PI * 2,
      leafBase:        leafBase,
      nextLeafSpacing: leafBase * (0.7 + Math.random() * 0.55),
      stemW:           stemW,
      col:             col,
      stemDark:        shadeColor(col, -0.22, +12),
      stemHi:          shadeColor(col, +0.20, -8),
    };
    // Start the rAF loop immediately so the stem appears as soon as drawing begins
    if (!state.vineAnimFrame) {
      state.vineAnimFrame = requestAnimationFrame(vineOverlayFrame);
    }
  }

  var st = state.vineStrokeV2;
  var ddx = x - st.lx, ddy = y - st.ly;
  var d = Math.hypot(ddx, ddy);

  if (d > 0.3) {
    st.points.push({x: x, y: y});

    var ndx = ddx / d, ndy = ddy / d;
    if (!st.dir) {
      st.dir = [ndx, ndy];
    } else {
      st.dir[0] = st.dir[0] * 0.72 + ndx * 0.28;
      st.dir[1] = st.dir[1] * 0.72 + ndy * 0.28;
      var m = Math.hypot(st.dir[0], st.dir[1]) || 1;
      st.dir[0] /= m; st.dir[1] /= m;
    }
  }

  st.lx = x; st.ly = y;
  st.stemDist  += d;
  st.accumLeaf += d;

  // Spawn leaves
  while (st.accumLeaf >= st.nextLeafSpacing && st.dir) {
    st.accumLeaf -= st.nextLeafSpacing;
    st.nextLeafSpacing = st.leafBase * (0.7 + Math.random() * 0.55);
    st.side = -st.side;

    var tx = st.dir[0], ty = st.dir[1];
    var perpX = -ty * st.side, perpY = tx * st.side;
    var bias = 0.05 + Math.random() * 0.18;
    var ldx = perpX * (1 - bias) + tx * bias;
    var ldy = perpY * (1 - bias) + ty * bias;
    var lm = Math.hypot(ldx, ldy) || 1;
    ldx /= lm; ldy /= lm;

    var ang = (Math.random() - 0.5) * 0.98;
    var ca = Math.cos(ang), sa = Math.sin(ang);

    var leafLen = Math.max(24, state.brushSize * 1.9) * (0.80 + Math.random() * 0.50);
    var leafCol = adjacentColor(col, 25);

    state.vineLiveLeaves.push({
      cx: x, cy: y,
      dx: ldx * ca - ldy * sa,
      dy: ldx * sa + ldy * ca,
      len:         leafLen,
      squat:       0.70 + Math.random() * 0.18,
      peakT:       0.36 + Math.random() * 0.14,
      asym:        (Math.random() - 0.5) * 0.28,
      fillColor:   leafCol,
      rimColor:    shadeColor(leafCol, -0.25, +8),
      alpha:       1.0,
      born:        performance.now(),
      growDuration: GROW_DURATION + Math.random() * 80,
    });
  }
}

export function finalizeVineStrokeV2() {
  // Commit stems to main canvas first (leaves draw on top)
  if (state.vineStrokeV2) drawStemPath(state.ctx, state.vineStrokeV2);
  if (state.mirrorVineStrokeV2) drawStemPath(state.ctx, state.mirrorVineStrokeV2);

  // Commit all leaves (fully grown and still growing) to main canvas
  state.vineFullLeaves.forEach(function(leaf) { commitLeaf(state.ctx, leaf); });
  state.vineLiveLeaves.forEach(function(leaf) { commitLeaf(state.ctx, leaf); });
  state.vineFullLeaves = [];
  state.vineLiveLeaves = [];

  if (state.vineAnimFrame) {
    cancelAnimationFrame(state.vineAnimFrame);
    state.vineAnimFrame = null;
  }
  state.ovCtx.clearRect(0, 0, state.canvasW, state.canvasH);

  if (state.mirrorVineStrokeV2) state.mirrorVineStrokeV2 = null;
  state.vineStrokeV2 = null;
}
