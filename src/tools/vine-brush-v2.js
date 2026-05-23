import state from '../state.js';
import { adjacentColor, shadeColor } from '../core/color-utils.js';

// Draw a bezier-curve leaf shape. Caller sets ctx.globalAlpha before calling.
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

  // Rim edge
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = Math.max(0.5, len * 0.025);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = baseAlpha * 0.28;
  ctx.stroke();

  // Highlight — smaller leaf offset slightly toward the light side
  var hiLen = len * 0.68, hiHW = halfW * 0.42;
  var hiOx = cx + px * halfW * 0.25, hiOy = cy + py * halfW * 0.25;
  leafPath(hiOx, hiOy, hiLen, hiHW);
  ctx.fillStyle = shadeColor(fillColor, +0.30, -6);
  ctx.globalAlpha = baseAlpha * 0.36;
  ctx.fill();

  // Midrib line
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + dx * len * 0.86, cy + dy * len * 0.86);
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = Math.max(0.4, len * 0.02);
  ctx.globalAlpha = baseAlpha * 0.30;
  ctx.stroke();

  ctx.restore();
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

  // Stem drawing
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

  // Dark underside shadow
  if (stemW > 2) {
    state.ctx.beginPath();
    state.ctx.moveTo(st.lx - snx * off, st.ly - sny * off);
    state.ctx.lineTo(x - snx * off, y - sny * off);
    state.ctx.lineWidth = stemW * 0.65;
    state.ctx.strokeStyle = st.stemDark;
    state.ctx.globalAlpha = 0.40;
    state.ctx.stroke();
  }

  // Main stem
  state.ctx.beginPath();
  state.ctx.moveTo(st.lx, st.ly);
  state.ctx.lineTo(x, y);
  state.ctx.lineWidth = stemW * wob;
  state.ctx.strokeStyle = col;
  state.ctx.globalAlpha = 1.0;
  state.ctx.stroke();

  // Highlight stripe
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

  // Spawn leaves when threshold is crossed
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

    // Slight random rotation
    var ang = (Math.random() - 0.5) * 0.80;
    var ca = Math.cos(ang), sa = Math.sin(ang);
    var rxd = ldx * ca - ldy * sa;
    var ryd = ldx * sa + ldy * ca;

    var leafLen = Math.max(16, state.brushSize * 1.35) * (0.75 + Math.random() * 0.55);
    var leafCol = adjacentColor(col, 25);
    var leafRim = shadeColor(leafCol, -0.25, +8);

    state.ctx.save();
    state.ctx.globalAlpha = 0.78 + Math.random() * 0.18;
    drawLeaf(state.ctx, x, y, rxd, ryd, leafLen, st.leafSquat, leafCol, leafRim);
    state.ctx.restore();
  }
}

export function finalizeVineStrokeV2() {
  if (state.mirrorVineStrokeV2) state.mirrorVineStrokeV2 = null;
  state.vineStrokeV2 = null;
}
