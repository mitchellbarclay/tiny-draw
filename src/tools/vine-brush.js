import state from '../state.js';
import { getBrushStamp, stampDot } from '../core/brush-pipeline.js';
import { shadeColor, adjacentColor } from '../core/color-utils.js';

function drawLeafBand(cx, cy, dx, dy, size, squat, colA, colB, t0, t1) {
  if (t1 <= t0) return;
  var leafLen = size, leafWid = size*squat;
  var nx = -dy, ny = dx;
  var samples = Math.max(2, Math.ceil((t1-t0)*leafLen*0.9));
  var prevA = state.ctx.globalAlpha;
  for (var s = 0; s <= samples; s++) {
    var t = t0+(t1-t0)*s/samples;
    if (t > 1) t = 1;
    var profile = Math.pow(Math.sin(Math.PI*t),1.7)*(1-0.42*t);
    var w = leafWid*profile;
    if (w >= 0.6) {
      var curve = Math.sin(Math.PI*t)*leafLen*0.11;
      var px = cx+dx*leafLen*t+nx*curve;
      var py = cy+dy*leafLen*t+ny*curve;
      state.ctx.globalAlpha = 0.20+Math.random()*0.10;
      stampDot(state.ctx, px, py, getBrushStamp(Math.max(1,Math.round(w*1.18)), colB));
      state.ctx.globalAlpha = 0.55+Math.random()*0.20;
      stampDot(state.ctx, px, py, getBrushStamp(Math.max(1,Math.round(w)), colA));
    }
    if (t >= 1) break;
  }
  if (t1 >= 1) {
    var ribSteps = Math.max(6, Math.round(leafLen*0.5));
    state.ctx.globalAlpha = 0.45;
    for (var rs = 0; rs <= ribSteps; rs++) {
      var rt = 0.06+(0.94-0.06)*(rs/ribSteps);
      var taper = Math.sin(Math.PI*rt);
      var rR = Math.max(1, Math.round(size*0.045*taper));
      var rcurve = Math.sin(Math.PI*rt)*leafLen*0.11;
      var rx = cx+dx*leafLen*rt+nx*rcurve;
      var ry = cy+dy*leafLen*rt+ny*rcurve;
      stampDot(state.ctx, rx, ry, getBrushStamp(rR, colB));
    }
  }
  state.ctx.globalAlpha = prevA;
}

export function drawVineStroke(x, y, col) {
  if (!state.vineStroke) {
    var leafBase = Math.max(22, state.brushSize*0.95);
    state.vineStroke = {
      accumLeaf: 0, side: 1, lx: state.lastX, ly: state.lastY, dir: null,
      leafSquat: 0.24+Math.random()*0.14, leafBias: 0.05+Math.random()*0.18,
      sizeJitter: 1.05+Math.random()*0.5, leaves: [], stemDist: 0,
      phase: Math.random()*6.283, leafBase: leafBase,
      nextLeafSpacing: leafBase*(0.7+Math.random()*0.55),
      stemShadowCol: shadeColor(col,-0.20,+12),
      stemHiCol: shadeColor(col,+0.18,-10)
    };
  }
  var st = state.vineStroke;
  var ddx = x-st.lx, ddy = y-st.ly;
  var d = Math.hypot(ddx, ddy);
  if (d > 0.3) {
    var ndx = ddx/d, ndy = ddy/d;
    if (!st.dir) st.dir = [ndx, ndy];
    else {
      st.dir[0] = st.dir[0]*0.7+ndx*0.3;
      st.dir[1] = st.dir[1]*0.7+ndy*0.3;
      var m = Math.hypot(st.dir[0],st.dir[1])||1;
      st.dir[0] /= m; st.dir[1] /= m;
    }
  }
  st.lx = x; st.ly = y;
  var stemBaseR = Math.max(2, state.brushSize*0.20);
  var tdx, tdy;
  if (d > 0) { tdx = ddx/d; tdy = ddy/d; }
  else if (st.dir) { tdx = st.dir[0]; tdy = st.dir[1]; }
  else { tdx = 1; tdy = 0; }
  var snx = -tdy, sny = tdx;
  if (snx+sny > 0) { snx = -snx; sny = -sny; }
  var seg = Math.max(1, Math.ceil(d));
  var prevA = state.ctx.globalAlpha;
  for (var si = 1; si <= seg; si++) {
    var f = si/seg;
    var sx = state.lastX+ddx*f, sy = state.lastY+ddy*f;
    var sd = st.stemDist + d*f;
    var wob = 0.88+0.16*Math.sin(sd*0.018+st.phase);
    var sR = Math.max(2, Math.round(stemBaseR*wob));
    state.ctx.globalAlpha = 1.0;
    stampDot(state.ctx, sx, sy, getBrushStamp(sR, col));
    var off = sR*0.55, shadeR = Math.max(1, Math.round(sR*0.85));
    state.ctx.globalAlpha = 0.45;
    stampDot(state.ctx, sx-snx*off, sy-sny*off, getBrushStamp(shadeR, st.stemShadowCol));
    var hiR = Math.max(1, Math.round(sR*0.55));
    state.ctx.globalAlpha = 0.55;
    stampDot(state.ctx, sx+snx*off*0.7, sy+sny*off*0.7, getBrushStamp(hiR, st.stemHiCol));
  }
  state.ctx.globalAlpha = prevA;
  st.stemDist += d;
  st.accumLeaf += d;
  while (st.accumLeaf >= st.nextLeafSpacing && st.dir) {
    st.accumLeaf -= st.nextLeafSpacing;
    st.nextLeafSpacing = st.leafBase*(0.7+Math.random()*0.55);
    st.side = -st.side;
    var tx = st.dir[0], ty = st.dir[1];
    var pxp = -ty*st.side, pyp = tx*st.side;
    var bias = st.leafBias;
    var lxd = pxp*(1-bias)+tx*bias, lyd = pyp*(1-bias)+ty*bias;
    var lm = Math.hypot(lxd,lyd)||1; lxd /= lm; lyd /= lm;
    var ang = (Math.random()-0.5)*0.98;
    var ca = Math.cos(ang), sa = Math.sin(ang);
    var rxd = lxd*ca-lyd*sa, ryd = lxd*sa+lyd*ca;
    var leafSize = Math.max(18, state.brushSize*1.4)*(0.78+Math.random()*0.55)*st.sizeJitter;
    var colA = adjacentColor(col, 28), colB = adjacentColor(col, 18);
    st.leaves.push({cx:x,cy:y,dx:rxd,dy:ryd,size:leafSize,squat:st.leafSquat,colA:colA,colB:colB,drawnT:0,growthDist:st.leafBase*1.1});
  }
  if (d > 0) {
    for (var i = st.leaves.length-1; i >= 0; i--) {
      var L = st.leaves[i];
      var newT = Math.min(1, L.drawnT + d/L.growthDist);
      drawLeafBand(L.cx,L.cy,L.dx,L.dy,L.size,L.squat,L.colA,L.colB,L.drawnT,newT);
      L.drawnT = newT;
      if (L.drawnT >= 1) st.leaves.splice(i, 1);
    }
  }
}

export function finalizeVineStroke() {
  if (state.mirrorVineStroke) {
    var mls = state.mirrorVineStroke.leaves;
    for (var mi = 0; mi < mls.length; mi++) {
      var ML = mls[mi];
      if (ML.drawnT < 1) drawLeafBand(ML.cx,ML.cy,ML.dx,ML.dy,ML.size,ML.squat,ML.colA,ML.colB,ML.drawnT,1);
    }
    state.mirrorVineStroke = null;
  }
  if (!state.vineStroke) return;
  var ls = state.vineStroke.leaves;
  for (var i = 0; i < ls.length; i++) {
    var L = ls[i];
    if (L.drawnT < 1) drawLeafBand(L.cx,L.cy,L.dx,L.dy,L.size,L.squat,L.colA,L.colB,L.drawnT,1);
  }
  state.vineStroke = null;
}
