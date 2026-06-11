import state from '../state.js';
import { shadeColor } from '../core/color-utils.js';

var PIPE_LX = -0.5, PIPE_LY = -0.866;

function makePipeGradStops(col) {
  return [
    {pos:0.00, col:shadeColor(col,-0.44,+12)},
    {pos:0.18, col:shadeColor(col,-0.14,+5)},
    {pos:0.40, col:shadeColor(col,+0.04,-2)},
    {pos:0.64, col:shadeColor(col,+0.22,-10)},
    {pos:0.84, col:shadeColor(col,+0.42,-20)},
    {pos:1.00, col:shadeColor(col,+0.54,-24)}
  ];
}

function pipeLayer(tCtx, pts, ox, oy, lw, col, cap, alpha) {
  if (alpha != null) tCtx.globalAlpha = alpha;
  tCtx.strokeStyle = col; tCtx.lineWidth = lw;
  tCtx.lineCap = cap||'round'; tCtx.lineJoin = 'round';
  tCtx.beginPath(); tCtx.moveTo(pts[0].x+ox, pts[0].y+oy);
  for (var i = 1; i < pts.length; i++) tCtx.lineTo(pts[i].x+ox, pts[i].y+oy);
  tCtx.stroke();
  if (alpha != null) tCtx.globalAlpha = 1;
}

function buildPipeOffsetPts(pts, dist) {
  var out = [];
  for (var i = 0; i < pts.length; i++) {
    var dx, dy;
    if (pts.length < 2) { out.push({x:pts[i].x,y:pts[i].y}); continue; }
    if (i===0)               { dx=pts[1].x-pts[0].x;   dy=pts[1].y-pts[0].y; }
    else if (i===pts.length-1) { dx=pts[i].x-pts[i-1].x; dy=pts[i].y-pts[i-1].y; }
    else                     { dx=pts[i+1].x-pts[i-1].x; dy=pts[i+1].y-pts[i-1].y; }
    var len = Math.hypot(dx,dy);
    if (len < 1e-6) { out.push({x:pts[i].x,y:pts[i].y}); continue; }
    var nx = -dy/len, ny = dx/len;
    var proj = PIPE_LX*nx+PIPE_LY*ny;
    out.push({x:pts[i].x+nx*proj*dist, y:pts[i].y+ny*proj*dist});
  }
  return out;
}

function drawPipeCurved(tCtx, pts, r, gradStops) {
  if (pts.length < 2) return;
  var dx = pts[pts.length-1].x-pts[0].x, dy = pts[pts.length-1].y-pts[0].y;
  var len = Math.hypot(dx,dy)||1, nx = -dy/len, ny = dx/len;
  var proj = PIPE_LX*nx+PIPE_LY*ny, litSign = proj>=0?1:-1;
  var midX = (pts[0].x+pts[pts.length-1].x)*0.5, midY = (pts[0].y+pts[pts.length-1].y)*0.5;
  var grad = tCtx.createLinearGradient(midX-nx*litSign*r,midY-ny*litSign*r,midX+nx*litSign*r,midY+ny*litSign*r);
  for (var i = 0; i < gradStops.length; i++) grad.addColorStop(gradStops[i].pos,gradStops[i].col);
  tCtx.strokeStyle = grad; tCtx.lineWidth = r*2; tCtx.lineCap = 'butt'; tCtx.lineJoin = 'round';
  tCtx.beginPath(); tCtx.moveTo(pts[0].x,pts[0].y);
  for (var i = 1; i < pts.length; i++) tCtx.lineTo(pts[i].x,pts[i].y);
  tCtx.stroke();
}

function drawPipeStraight(tCtx, x1, y1, x2, y2, r, gradStops, roundEnd) {
  var dx = x2-x1, dy = y2-y1, len = Math.hypot(dx,dy);
  if (len < 1) return;
  var nx = -dy/len, ny = dx/len;
  var proj = PIPE_LX*nx+PIPE_LY*ny, litSign = proj>=0?1:-1;
  var midX = (x1+x2)*0.5, midY = (y1+y2)*0.5;
  var grad = tCtx.createLinearGradient(midX-nx*litSign*r,midY-ny*litSign*r,midX+nx*litSign*r,midY+ny*litSign*r);
  for (var i = 0; i < gradStops.length; i++) grad.addColorStop(gradStops[i].pos,gradStops[i].col);
  tCtx.strokeStyle = grad; tCtx.lineWidth = r*2; tCtx.lineCap = roundEnd?'round':'butt'; tCtx.lineJoin = 'round';
  tCtx.beginPath(); tCtx.moveTo(x1,y1); tCtx.lineTo(x2,y2); tCtx.stroke();
}

function buildPipeElbow(cx, cy, dInX, dInY, dOutX, dOutY, r, maxLen) {
  var dot = dInX*dOutX+dInY*dOutY, sharpness = Math.max(0,-dot);
  var elbLen = r*2.2*(1+sharpness*1.4);
  if (maxLen != null) elbLen = Math.min(elbLen, maxLen);
  if (elbLen < r*0.4) return null;
  var sX = cx-dInX*elbLen, sY = cy-dInY*elbLen;
  var eX = cx+dOutX*elbLen, eY = cy+dOutY*elbLen;
  var cross = dInX*dOutY-dInY*dOutX, side = cross>=0?1:-1;
  var perpX = -dInY*side, perpY = dInX*side;
  var k = elbLen*0.55, pBias = sharpness*elbLen*0.85;
  var c1x = sX+dInX*k+perpX*pBias, c1y = sY+dInY*k+perpY*pBias;
  var c2x = eX-dOutX*k+perpX*pBias, c2y = eY-dOutY*k+perpY*pBias;
  var steps = 14, pts = [];
  for (var i = 0; i <= steps; i++) {
    var t = i/steps, mt = 1-t, mt2 = mt*mt, mt3 = mt2*mt, t2 = t*t, t3 = t2*t;
    pts.push({x:mt3*sX+3*mt2*t*c1x+3*mt*t2*c2x+t3*eX, y:mt3*sY+3*mt2*t*c1y+3*mt*t2*c2y+t3*eY});
  }
  return {pts:pts, sX:sX, sY:sY, eX:eX, eY:eY, dInX:dInX, dInY:dInY, dOutX:dOutX, dOutY:dOutY};
}

function buildDoubleElbow(cx, cy, dInX, dInY, dOutX, dOutY, r, maxLen) {
  var dot = dInX*dOutX+dInY*dOutY, sharpness = Math.max(0,-dot);
  var elbLen = r*2.2*(1+sharpness*1.4);
  if (maxLen != null) elbLen = Math.min(elbLen, maxLen);
  if (elbLen < r*0.4) return null;
  var sX = cx-dInX*elbLen, sY = cy-dInY*elbLen;
  var eX = cx+dOutX*elbLen, eY = cy+dOutY*elbLen;
  return {type:'double', sX:sX, sY:sY, eX:eX, eY:eY, pivX:cx, pivY:cy, dInX:dInX, dInY:dInY, dOutX:dOutX, dOutY:dOutY};
}

function drawPipeRing(tCtx, cx, cy, nx, ny, r, gradStops) {
  var jR = r*1.40, jL = r*0.30;
  var x1 = cx-nx*jL, y1 = cy-ny*jL, x2 = cx+nx*jL, y2 = cy+ny*jL;
  var px = -ny, py = nx;
  var proj = PIPE_LX*px+PIPE_LY*py, litSign = proj>=0?1:-1;
  var grad = tCtx.createLinearGradient(cx-px*litSign*jR,cy-py*litSign*jR,cx+px*litSign*jR,cy+py*litSign*jR);
  for (var i = 0; i < gradStops.length; i++) grad.addColorStop(gradStops[i].pos,gradStops[i].col);
  tCtx.strokeStyle = grad; tCtx.lineWidth = jR*2; tCtx.lineCap = 'butt'; tCtx.lineJoin = 'round';
  tCtx.beginPath(); tCtx.moveTo(x1,y1); tCtx.lineTo(x2,y2); tCtx.stroke();
}

export function drawPipeStrokeState(tCtx, ps, liveX, liveY) {
  var r = ps.r, anchors = ps.anchors, n = anchors.length;
  var pts = [{x:ps.startX,y:ps.startY}];
  for (var i = 0; i < n; i++) pts.push({x:anchors[i].x,y:anchors[i].y});
  var hasLive = false;
  if (liveX != null) {
    var lp = pts[pts.length-1];
    if (Math.hypot(liveX-lp.x,liveY-lp.y) > 2) { pts.push({x:liveX,y:liveY}); hasLive = true; }
  }
  var P = pts.length;
  if (P < 2) { drawPipeRing(tCtx,ps.startX,ps.startY,1,0,r,ps.gradStops); return; }

  var dirs = [];
  for (var i = 0; i < P-1; i++) {
    var ddx = pts[i+1].x-pts[i].x, ddy = pts[i+1].y-pts[i].y;
    var dl = Math.hypot(ddx,ddy)||1;
    dirs.push({dx:ddx/dl,dy:ddy/dl});
  }
  var segLens = [];
  for (var i = 0; i < P-1; i++) segLens.push(Math.hypot(pts[i+1].x-pts[i].x,pts[i+1].y-pts[i].y));

  var elbows = [];
  for (var i = 0; i < P-2; i++) {
    var pi = i+1, maxL = Math.min(segLens[i],segLens[i+1])*0.44;
    var dot = dirs[i].dx*dirs[i+1].dx+dirs[i].dy*dirs[i+1].dy;
    if (dot < -0.3) elbows.push(buildDoubleElbow(pts[pi].x,pts[pi].y,dirs[i].dx,dirs[i].dy,dirs[i+1].dx,dirs[i+1].dy,r,maxL));
    else            elbows.push(buildPipeElbow(pts[pi].x,pts[pi].y,dirs[i].dx,dirs[i].dy,dirs[i+1].dx,dirs[i+1].dy,r,maxL));
  }

  var segSX=[],segSY=[],segEX=[],segEY=[];
  var csx = pts[0].x, csy = pts[0].y;
  for (var i = 0; i < P-1; i++) {
    segSX.push(csx); segSY.push(csy);
    if (i < elbows.length && elbows[i] != null) {
      segEX.push(elbows[i].sX); segEY.push(elbows[i].sY);
      csx = elbows[i].eX; csy = elbows[i].eY;
    } else {
      segEX.push(pts[i+1].x); segEY.push(pts[i+1].y);
      csx = pts[i+1].x; csy = pts[i+1].y;
    }
  }

  drawPipeRing(tCtx,pts[0].x,pts[0].y,dirs[0].dx,dirs[0].dy,r,ps.gradStops);
  var deferredEndRing = null;
  for (var i = 0; i < P-1; i++) {
    var isLast = (i === P-2);
    drawPipeStraight(tCtx,segSX[i],segSY[i],segEX[i],segEY[i],r,ps.gradStops,isLast&&hasLive);
    if (deferredEndRing) {
      var dr = deferredEndRing; deferredEndRing = null;
      drawPipeRing(tCtx,dr.eX,dr.eY,dr.dOutX,dr.dOutY,r,ps.gradStops);
    }
    if (i < elbows.length && elbows[i] != null) {
      var elb = elbows[i];
      if (elb.type === 'double') {
        drawPipeStraight(tCtx,elb.sX,elb.sY,elb.pivX,elb.pivY,r,ps.gradStops,true);
        drawPipeStraight(tCtx,elb.pivX,elb.pivY,elb.eX,elb.eY,r,ps.gradStops,true);
        drawPipeRing(tCtx,elb.sX,elb.sY,elb.dInX,elb.dInY,r,ps.gradStops);
        deferredEndRing = elb;
      } else {
        drawPipeCurved(tCtx,elb.pts,r,ps.gradStops);
        drawPipeRing(tCtx,elb.sX,elb.sY,elb.dInX,elb.dInY,r,ps.gradStops);
        deferredEndRing = elb;
      }
    }
  }
  if (deferredEndRing) drawPipeRing(tCtx,deferredEndRing.eX,deferredEndRing.eY,deferredEndRing.dOutX,deferredEndRing.dOutY,r,ps.gradStops);
  if (!hasLive) {
    var ld = dirs[dirs.length-1], lp = pts[P-1];
    drawPipeRing(tCtx,lp.x,lp.y,ld.dx,ld.dy,r,ps.gradStops);
  }
}

function pipeOverlayDraw() {
  state.pipeAnimFrame = null;
  state.ovCtx.clearRect(0, 0, state.canvasW, state.canvasH);
  if (state.pipeStroke) drawPipeStrokeState(state.ovCtx,state.pipeStroke,state.pipeStroke.liveX,state.pipeStroke.liveY);
  if (state.mirrorMode && state.mirrorPipeStroke)
    drawPipeStrokeState(state.ovCtx,state.mirrorPipeStroke,state.mirrorPipeStroke.liveX,state.mirrorPipeStroke.liveY);
}

function _commitAndContinuePipe() {
  if (!state.pipeStroke) return;
  var ps = state.pipeStroke;
  var mps = state.mirrorPipeStroke;
  if (state.pipeAnimFrame) { cancelAnimationFrame(state.pipeAnimFrame); state.pipeAnimFrame = null; }

  if (!state.painting || ps.anchors.length === 0) {
    finalizePipeStroke();
    return;
  }

  function _resetStroke(src) {
    var ci = src.anchors.length - 1;
    var carry = src.anchors[ci];
    var prev = ci > 0 ? src.anchors[ci - 1] : {x: src.startX, y: src.startY};
    var commitPs = {r:src.r, col:src.col, gradStops:src.gradStops, startX:src.startX, startY:src.startY, anchors:src.anchors.slice(0, ci)};
    drawPipeStrokeState(state.ctx, commitPs, null, null);
    return {r:src.r, col:src.col, gradStops:src.gradStops, threshold:src.threshold,
            startX:prev.x, startY:prev.y, anchors:[{x:carry.x, y:carry.y}], liveX:src.liveX, liveY:src.liveY};
  }

  state.pipeStroke = _resetStroke(ps);
  state.pipeStroke.commitTimer = setTimeout(_commitAndContinuePipe, 2000);
  if (mps && mps.anchors.length > 0) state.mirrorPipeStroke = _resetStroke(mps);

  state.pipeAnimFrame = requestAnimationFrame(pipeOverlayDraw);
}

export function drawPipeStroke(x, y, col) {
  var r = Math.max(7, Math.round(state.brushSize*0.48));
  if (!state.pipeStroke) {
    state.pipeStroke = {r:r, col:col, gradStops:makePipeGradStops(col), threshold:r*14, startX:state.lastX, startY:state.lastY, anchors:[], liveX:x, liveY:y};
    state.pipeStroke.commitTimer = setTimeout(_commitAndContinuePipe, 2000);
  }
  var ps = state.pipeStroke;
  ps.liveX = x; ps.liveY = y;
  var last = ps.anchors.length>0 ? ps.anchors[ps.anchors.length-1] : {x:ps.startX,y:ps.startY};
  var dist = Math.hypot(x-last.x, y-last.y);
  if (dist >= ps.threshold) ps.anchors.push({x:x,y:y});
  if (!state.pipeAnimFrame) state.pipeAnimFrame = requestAnimationFrame(pipeOverlayDraw);
}

export function finalizePipeStroke() {
  if (!state.pipeStroke) return;
  if (state.pipeStroke.commitTimer) { clearTimeout(state.pipeStroke.commitTimer); state.pipeStroke.commitTimer = null; }
  if (state.pipeAnimFrame) { cancelAnimationFrame(state.pipeAnimFrame); state.pipeAnimFrame = null; }
  var ps = state.pipeStroke; state.pipeStroke = null;
  var mps = state.mirrorPipeStroke; state.mirrorPipeStroke = null;
  state.ovCtx.clearRect(0, 0, state.canvasW, state.canvasH);
  if (ps.liveX != null) {
    var last = ps.anchors.length>0 ? ps.anchors[ps.anchors.length-1] : {x:ps.startX,y:ps.startY};
    if (Math.hypot(ps.liveX-last.x, ps.liveY-last.y) >= 4) ps.anchors.push({x:ps.liveX,y:ps.liveY});
  }
  if (mps && mps.liveX != null) {
    var mlast = mps.anchors.length>0 ? mps.anchors[mps.anchors.length-1] : {x:mps.startX,y:mps.startY};
    if (Math.hypot(mps.liveX-mlast.x, mps.liveY-mlast.y) >= 4) mps.anchors.push({x:mps.liveX,y:mps.liveY});
  }
  drawPipeStrokeState(state.ctx, ps, null, null);
  if (mps) drawPipeStrokeState(state.ctx, mps, null, null);
}
