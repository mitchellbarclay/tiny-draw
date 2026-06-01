import state from '../state.js';

var BOLT_MORPH_MS = 90;

function fractalBolt(x0, y0, x1, y1, depth, spread, branches) {
  var dx = x1-x0, dy = y1-y0, len = Math.hypot(dx, dy);
  if (depth <= 0 || len < 3) return [{x:x0,y:y0},{x:x1,y:y1}];
  var nx = -dy/len, ny = dx/len;
  var disp = (Math.random()-0.5)*spread;
  var mx = (x0+x1)/2+nx*disp, my = (y0+y1)/2+ny*disp;
  if (branches && depth === 2 && Math.random() < 0.50) {
    var bAng = Math.atan2(dy,dx) + (Math.random()<0.5?-1:1)*(0.5+Math.random()*0.9);
    var bLen = len*(0.28+Math.random()*0.42);
    branches.push({x0:mx,y0:my,x1:mx+Math.cos(bAng)*bLen,y1:my+Math.sin(bAng)*bLen,depth:depth-1,spread:spread*0.45});
  }
  var left = fractalBolt(x0,y0,mx,my,depth-1,spread*0.58,branches);
  var right = fractalBolt(mx,my,x1,y1,depth-1,spread*0.58,branches);
  return left.concat(right.slice(1));
}

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

function bakeBolt(x0, y0, x1, y1, col) {
  var len = Math.hypot(x1-x0, y1-y0);
  if (len < 2) return;
  var depth = Math.min(5, 2+Math.floor(Math.log2(Math.max(1,len/10))));
  var pts = fractalBolt(x0, y0, x1, y1, depth, len*0.72, null);
  var w = Math.max(2, state.brushSize*0.70);
  strokeBoltGlow(state.ctx, pts, col, w);
  drawBoltPath(state.ctx, pts, '#fff', Math.max(1,w*0.40), 0.95);
}

function boltMakeParam(bs) {
  var ax = bs.anchorX, ay = bs.anchorY, cx = bs.curX, cy = bs.curY;
  var len = Math.hypot(cx-ax, cy-ay);
  if (len <= 4) return null;
  var depth = Math.min(5, 2+Math.floor(Math.log2(Math.max(1,len/10))));
  var abs = fractalBolt(ax,ay,cx,cy,depth,len*0.72,null);
  var dx = cx-ax, dy = cy-ay;
  var ux = dx/len, uy = dy/len, nx = -uy, ny = ux;
  return abs.map(function(p) {
    var rx = p.x-ax, ry = p.y-ay;
    return {t:(rx*ux+ry*uy)/len, d:rx*nx+ry*ny};
  });
}

function boltParamToAbsFixed(param, ax, ay, x1, y1) {
  var dx = x1-ax, dy = y1-ay, len = Math.hypot(dx,dy);
  if (len < 1) return param.map(function() { return {x:ax,y:ay}; });
  var nx = -dy/len, ny = dx/len;
  return param.map(function(p) { return {x:ax+p.t*dx+p.d*nx, y:ay+p.t*dy+p.d*ny}; });
}

function drawBoltParam(targetCtx, param, ax, ay, x1, y1, col) {
  var pts = boltParamToAbsFixed(param, ax, ay, x1, y1);
  var w = Math.max(2, state.brushSize*0.70);
  strokeBoltGlow(targetCtx, pts, col, w);
  drawBoltPath(targetCtx, pts, '#fff', Math.max(1,w*0.40), 0.95);
}

function boltCurrentParam() {
  if (!state.boltPtsA || !state.boltPtsB) return null;
  var tNow = Math.min(1, (performance.now()-state.boltMorphStart)/BOLT_MORPH_MS);
  var e = tNow*tNow*(3-2*tNow);
  var n = Math.min(state.boltPtsA.length, state.boltPtsB.length);
  var param = [];
  for (var i = 0; i < n; i++)
    param.push({t:state.boltPtsA[i].t+(state.boltPtsB[i].t-state.boltPtsA[i].t)*e, d:state.boltPtsA[i].d+(state.boltPtsB[i].d-state.boltPtsA[i].d)*e});
  return param;
}

// The overlay only ever shows the live, uncommitted tail (the crackling
// segment from the last anchor to the cursor). Committed segments are baked
// straight to the main canvas in drawBoltStroke and never drawn here, so the
// baked ink and the live preview can never overlap (no double stroke) and a
// committed segment can never be left animating or dropped.
function boltOverlayFrame() {
  var hasMain   = !!state.boltStroke;
  var hasMirror = state.mirrorMode && !!state.mirrorBoltStroke;
  if (!hasMain && !hasMirror) {
    state.ovCtx.clearRect(0,0,state.canvasW,state.canvasH);
    state.boltPtsA = null; state.boltPtsB = null;
    state.boltAnimFrame = null;
    return;
  }
  var now = performance.now();
  state.ovCtx.clearRect(0,0,state.canvasW,state.canvasH);

  if (state.boltStroke) {
    var bs = state.boltStroke;
    if (!state.boltPtsA) {
      state.boltPtsA = boltMakeParam(bs); state.boltPtsB = boltMakeParam(bs); state.boltMorphStart = now;
    }
    var t = (now-state.boltMorphStart)/BOLT_MORPH_MS;
    if (t >= 1) { state.boltPtsA = state.boltPtsB; state.boltPtsB = boltMakeParam(bs); state.boltMorphStart = now; t = 0; }
    var ease = t*t*(3-2*t);
    if (state.boltPtsA && state.boltPtsB) {
      var n2 = Math.min(state.boltPtsA.length,state.boltPtsB.length);
      var param = [];
      for (var j = 0; j < n2; j++)
        param.push({t:state.boltPtsA[j].t+(state.boltPtsB[j].t-state.boltPtsA[j].t)*ease, d:state.boltPtsA[j].d+(state.boltPtsB[j].d-state.boltPtsA[j].d)*ease});
      drawBoltParam(state.ovCtx,param,bs.anchorX,bs.anchorY,bs.curX,bs.curY,bs.col);
    }
  }

  if (hasMirror && state.mirrorBoltStroke) {
    var mbs = state.mirrorBoltStroke;
    if (!state.mirrorBoltPtsA) {
      state.mirrorBoltPtsA = boltMakeParam(mbs); state.mirrorBoltPtsB = boltMakeParam(mbs); state.mirrorBoltMorphStart = now;
    }
    var mt = (now-state.mirrorBoltMorphStart)/BOLT_MORPH_MS;
    if (mt >= 1) { state.mirrorBoltPtsA = state.mirrorBoltPtsB; state.mirrorBoltPtsB = boltMakeParam(mbs); state.mirrorBoltMorphStart = now; mt = 0; }
    var mEase = mt*mt*(3-2*mt);
    if (state.mirrorBoltPtsA && state.mirrorBoltPtsB) {
      var mn2 = Math.min(state.mirrorBoltPtsA.length,state.mirrorBoltPtsB.length);
      var mParam = [];
      for (var mj = 0; mj < mn2; mj++)
        mParam.push({t:state.mirrorBoltPtsA[mj].t+(state.mirrorBoltPtsB[mj].t-state.mirrorBoltPtsA[mj].t)*mEase, d:state.mirrorBoltPtsA[mj].d+(state.mirrorBoltPtsB[mj].d-state.mirrorBoltPtsA[mj].d)*mEase});
      drawBoltParam(state.ovCtx,mParam,mbs.anchorX,mbs.anchorY,mbs.curX,mbs.curY,mbs.col);
    }
  }

  state.boltAnimFrame = requestAnimationFrame(boltOverlayFrame);
}

// Bake the segment anchor->(x,y) onto the main canvas. Uses the shape currently
// shown on the overlay (boltCurrentParam) so the hand-off from live preview to
// baked ink is seamless; falls back to a fresh fractal if no live shape exists.
function bakeBoltSegment(ax, ay, x, y, col) {
  var cur = boltCurrentParam();
  if (cur) drawBoltParam(state.ctx, cur, ax, ay, x, y, col);
  else bakeBolt(ax, ay, x, y, col);
}

export function drawBoltStroke(x, y, col) {
  if (!state.boltStroke) {
    state.boltStroke = {anchorX:state.lastX,anchorY:state.lastY,accum:0,lx:state.lastX,ly:state.lastY,curX:x,curY:y,col:col,accumStart:performance.now()};
  }
  // One shared animation loop drives both the main and mirror live tails; the
  // guard keeps the mirror pass from starting a second, uncancellable loop.
  if (!state.boltAnimFrame) state.boltAnimFrame = requestAnimationFrame(boltOverlayFrame);
  var bs = state.boltStroke;
  bs.col = col; bs.curX = x; bs.curY = y;
  bs.accum += Math.hypot(x-bs.lx, y-bs.ly);
  bs.lx = x; bs.ly = y;
  var threshold = Math.max(100, state.brushSize*7);
  if (bs.accum >= threshold) {
    // Commit the segment straight to the main canvas — gapless and never lost.
    bakeBoltSegment(bs.anchorX, bs.anchorY, x, y, col);
    bs.anchorX = x; bs.anchorY = y; bs.accum = 0; bs.accumStart = performance.now();
    state.boltPtsA = null; state.boltPtsB = null;
  }
}

export function finalizeBoltStroke() {
  if (!state.boltStroke) return;
  var bs = state.boltStroke;
  if (Math.hypot(bs.curX-bs.anchorX, bs.curY-bs.anchorY) > 4)
    bakeBoltSegment(bs.anchorX, bs.anchorY, bs.curX, bs.curY, bs.col);
  if (state.mirrorBoltStroke) {
    var mbs = state.mirrorBoltStroke;
    if (Math.hypot(mbs.curX-mbs.anchorX, mbs.curY-mbs.anchorY) > 4)
      bakeBolt(mbs.anchorX, mbs.anchorY, mbs.curX, mbs.curY, mbs.col);
    state.mirrorBoltStroke = null; state.mirrorBoltPtsA = null; state.mirrorBoltPtsB = null;
  }
  if (state.boltAnimFrame) { cancelAnimationFrame(state.boltAnimFrame); state.boltAnimFrame = null; }
  state.boltStroke = null; state.boltPtsA = null; state.boltPtsB = null;
  state.ovCtx.clearRect(0, 0, state.canvasW, state.canvasH);
}
