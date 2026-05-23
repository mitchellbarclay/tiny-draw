import state from '../state.js';
import { adjacentColor, shadeColor } from '../core/color-utils.js';

var GROW_DURATION = 220; // ms per leaf grow-in

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Draw a bezier-curve leaf. Caller sets ctx.globalAlpha before calling.
// cx/cy are the base (stem attachment), dx/dy are the normalised growth direction.
function drawLeaf(ctx, cx, cy, dx, dy, len, squat, fillColor, rimColor) {
  ctx.save();

  var halfW = len * squat * 0.5;
  var px = -dy, py = dx;
  var peakT = 0.42;

  function leafPath(ox, oy, l, hw) {
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.bezierCurveTo(
      ox + dx * l * 0.10 - px * hw * 0.55, oy + dy * l * 0.10 - py * hw * 0.55,
      ox + dx * l * peakT - px * hw,        oy + dy * l * peakT - py * hw,
      ox + dx * l,                           oy + dy * l
    );
    ctx.bezierCurveTo(
      ox + dx * l * peakT + px * hw,        oy + dy * l * peakT + py * hw,
      ox + dx * l * 0.10 + px * hw * 0.55, oy + dy * l * 0.10 + py * hw * 0.55,
      ox, oy
    );
    ctx.closePath();
  }

  var baseAlpha = ctx.globalAlpha;

  // Main leaf body
  leafPath(cx, cy, len, halfW);
  ctx.fillStyle = fillColor;
  ctx.globalAlpha = baseAlpha * 0.90;
  ctx.fill();

  // Rim stroke
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = Math.max(0.5, len * 0.025);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = baseAlpha * 0.28;
  ctx.stroke();

  // Highlight — smaller leaf offset toward the lit side
  var hiLen = len * 0.68, hiHW = halfW * 0.42;
  leafPath(cx + px * halfW * 0.25, cy + py * halfW * 0.25, hiLen, hiHW);
  ctx.fillStyle = shadeColor(fillColor, +0.30, -6);
  ctx.globalAlpha = baseAlpha * 0.36;
  ctx.fill();

  // Midrib
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + dx * len * 0.86, cy + dy * len * 0.86);
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = Math.max(0.4, len * 0.02);
  ctx.globalAlpha = baseAlpha * 0.30;
  ctx.stroke();

  ctx.restore();
}

// Draw a leaf at full scale to the given context (used when committing).
function commitLeaf(ctx, leaf) {
  ctx.save();
  ctx.translate(leaf.cx, leaf.cy);
  ctx.globalAlpha = leaf.alpha;
  drawLeaf(ctx, 0, 0, leaf.dx, leaf.dy, leaf.len, leaf.squat, leaf.fillColor, leaf.rimColor);
  ctx.restore();
}

function vineOverlayFrame() {
  if (!state.vineLiveLeaves.length) {
    state.ovCtx.clearRect(0, 0, state.canvasW, state.canvasH);
    state.vineAnimFrame = null;
    return;
  }

  var now = performance.now();
  state.ovCtx.clearRect(0, 0, state.canvasW, state.canvasH);

  state.vineLiveLeaves = state.vineLiveLeaves.filter(function(leaf) {
    var t = Math.min(1, (now - leaf.born) / leaf.growDuration);
    var scale = easeOut(t);

    if (t >= 1) {
      commitLeaf(state.ctx, leaf);
      return false;
    }

    // Draw growing leaf on overlay, scaled around its base point
    state.ovCtx.save();
    state.ovCtx.translate(leaf.cx, leaf.cy);
    state.ovCtx.scale(scale, scale);
    state.ovCtx.globalAlpha = leaf.alpha * (0.35 + 0.65 * t); // fade in as it grows
    drawLeaf(state.ovCtx, 0, 0, leaf.dx, leaf.dy, leaf.len, leaf.squat, leaf.fillColor, leaf.rimColor);
    state.ovCtx.restore();

    return true;
  });

  state.vineAnimFrame = requestAnimationFrame(vineOverlayFrame);
}

export function drawVineStrokeV2(x, y, col) {
  if (!state.vineStrokeV2) {
    var leafBase = Math.max(20, state.brushSize * 1.25);
    state.vineStrokeV2 = {
      lx: state.lastX, ly: state.lastY,
      dir: null,
      stemDist: 0,
      accumLeaf: 0,
      side: 1,
      phase: Math.random() * Math.PI * 2,
      leafBase: leafBase,
      leafSquat: 0.50 + Math.random() * 0.22,
      nextLeafSpacing: leafBase * (0.65 + Math.random() * 0.55),
      stemDark: shadeColor(col, -0.22, +12),
      stemHi: shadeColor(col, +0.20, -8),
    };
  }

  var st = state.vineStrokeV2;
  var ddx = x - st.lx, ddy = y - st.ly;
  var d = Math.hypot(ddx, ddy);

  // Smooth direction tracking
  if (d > 0.3) {
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

  // Stem — drawn directly to main canvas
  var stemW = Math.max(1.5, state.brushSize * 0.19);
  var wob = 1 + 0.14 * Math.sin(st.stemDist * 0.020 + st.phase);
  var tdx = d > 0 ? ddx / d : (st.dir ? st.dir[0] : 1);
  var tdy = d > 0 ? ddy / d : (st.dir ? st.dir[1] : 0);
  var snx = -tdy, sny = tdx;
  if (snx + sny > 0) { snx = -snx; sny = -sny; }
  var off = stemW * 0.42;

  state.ctx.save();
  state.ctx.lineCap = 'round';
  state.ctx.lineJoin = 'round';

  if (stemW > 2) {
    state.ctx.beginPath();
    state.ctx.moveTo(st.lx - snx * off, st.ly - sny * off);
    state.ctx.lineTo(x - snx * off, y - sny * off);
    state.ctx.lineWidth = stemW * 0.65;
    state.ctx.strokeStyle = st.stemDark;
    state.ctx.globalAlpha = 0.40;
    state.ctx.stroke();
  }

  state.ctx.beginPath();
  state.ctx.moveTo(st.lx, st.ly);
  state.ctx.lineTo(x, y);
  state.ctx.lineWidth = stemW * wob;
  state.ctx.strokeStyle = col;
  state.ctx.globalAlpha = 1.0;
  state.ctx.stroke();

  if (stemW > 2.5) {
    state.ctx.beginPath();
    state.ctx.moveTo(st.lx + snx * off * 0.6, st.ly + sny * off * 0.6);
    state.ctx.lineTo(x + snx * off * 0.6, y + sny * off * 0.6);
    state.ctx.lineWidth = stemW * 0.38;
    state.ctx.strokeStyle = st.stemHi;
    state.ctx.globalAlpha = 0.42;
    state.ctx.stroke();
  }

  state.ctx.restore();

  st.lx = x; st.ly = y;
  st.stemDist += d;
  st.accumLeaf += d;

  // Spawn leaves — added to live array so they animate on the overlay
  while (st.accumLeaf >= st.nextLeafSpacing && st.dir) {
    st.accumLeaf -= st.nextLeafSpacing;
    st.nextLeafSpacing = st.leafBase * (0.65 + Math.random() * 0.60);
    st.side = -st.side;

    var tx = st.dir[0], ty = st.dir[1];
    var perpX = -ty * st.side, perpY = tx * st.side;
    var bias = 0.06 + Math.random() * 0.20;
    var ldx = perpX * (1 - bias) + tx * bias;
    var ldy = perpY * (1 - bias) + ty * bias;
    var lm = Math.hypot(ldx, ldy) || 1;
    ldx /= lm; ldy /= lm;

    var ang = (Math.random() - 0.5) * 0.80;
    var ca = Math.cos(ang), sa = Math.sin(ang);

    var leafLen = Math.max(16, state.brushSize * 1.35) * (0.75 + Math.random() * 0.55);
    var leafCol = adjacentColor(col, 25);

    state.vineLiveLeaves.push({
      cx: x, cy: y,
      dx: ldx * ca - ldy * sa,
      dy: ldx * sa + ldy * ca,
      len: leafLen,
      squat: st.leafSquat,
      fillColor: leafCol,
      rimColor: shadeColor(leafCol, -0.25, +8),
      alpha: 0.78 + Math.random() * 0.18,
      born: performance.now(),
      growDuration: GROW_DURATION + Math.random() * 80,
    });

    if (!state.vineAnimFrame) {
      state.vineAnimFrame = requestAnimationFrame(vineOverlayFrame);
    }
  }
}

export function finalizeVineStrokeV2() {
  // Commit any leaves still animating immediately
  state.vineLiveLeaves.forEach(function(leaf) { commitLeaf(state.ctx, leaf); });
  state.vineLiveLeaves = [];

  if (state.vineAnimFrame) {
    cancelAnimationFrame(state.vineAnimFrame);
    state.vineAnimFrame = null;
  }
  state.ovCtx.clearRect(0, 0, state.canvasW, state.canvasH);

  if (state.mirrorVineStrokeV2) state.mirrorVineStrokeV2 = null;
  state.vineStrokeV2 = null;
}
