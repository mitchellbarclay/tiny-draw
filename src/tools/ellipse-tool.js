import state from '../state.js';
import { makeRectPattern, applyPattern, settleShape } from './rect-tool.js';

var ELLIPSE_STATE_DURATION = 800;

function ellipseStateFromSubTool() {
  return state.ellipseSubTool === 'outline' ? 0 : state.ellipseSubTool === 'filled' ? 1 : 2;
}

export function drawEllipseOnCtx(targetCtx, x1, y1, x2, y2, st, col, patternCanvas) {
  var rx = Math.abs(x2-x1)/2, ry = Math.abs(y2-y1)/2;
  if (rx < 1 || ry < 1) return;
  var cx = (x1+x2)/2, cy = (y1+y2)/2;
  var lw = Math.max(1, state.brushSize*0.2);
  targetCtx.save(); targetCtx.lineWidth = lw; targetCtx.strokeStyle = col;
  if (st === 0) {
    targetCtx.beginPath(); targetCtx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); targetCtx.stroke();
  } else if (st === 1) {
    targetCtx.beginPath(); targetCtx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); targetCtx.fillStyle = col; targetCtx.fill();
    targetCtx.beginPath(); targetCtx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); targetCtx.stroke();
  } else {
    if (patternCanvas) {
      targetCtx.save(); targetCtx.beginPath(); targetCtx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); targetCtx.clip();
      applyPattern(targetCtx, cx-rx, cy-ry, rx*2, ry*2, patternCanvas);
      targetCtx.restore();
    }
    targetCtx.beginPath(); targetCtx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); targetCtx.stroke();
  }
  targetCtx.restore();
}

function ellipseOverlayFrame() {
  if (!state.ellipseStroke) return;
  var es = state.ellipseStroke;
  var st = ellipseStateFromSubTool();
  if (st === 2) {
    var cycle = Math.floor((performance.now()-es.startTime)/ELLIPSE_STATE_DURATION);
    if (cycle !== es.lastCycle) { es.patternCanvas = makeRectPattern(es.col, state.brushSize/20); es.lastCycle = cycle; }
  }
  state.ovCtx.clearRect(0, 0, state.canvasW, state.canvasH);
  drawEllipseOnCtx(state.ovCtx, es.x1, es.y1, es.x2, es.y2, st, es.col, es.patternCanvas);
  if (state.mirrorMode) drawEllipseOnCtx(state.ovCtx, state.canvasW-es.x1, es.y1, state.canvasW-es.x2, es.y2, st, es.col, es.patternCanvas);
  state.ellipseAnimFrame = requestAnimationFrame(ellipseOverlayFrame);
}

export function drawEllipseStroke(x, y, col) {
  if (!state.ellipseStroke) {
    var c = col || state.color;
    state.ellipseStroke = {
      x1: state.lastX, y1: state.lastY, x2: x, y2: y, col: c,
      startTime: performance.now(), lastCycle: -1,
      patternCanvas: state.ellipseSubTool === 'pattern' ? makeRectPattern(c, state.brushSize/20) : null
    };
    state.ellipseAnimFrame = requestAnimationFrame(ellipseOverlayFrame);
  }
  state.ellipseStroke.x2 = x;
  state.ellipseStroke.y2 = y;
  state.ellipseStroke.col = col || state.color;
}

export function finalizeEllipseStroke() {
  if (!state.ellipseStroke) return;
  var es = state.ellipseStroke;
  var st = ellipseStateFromSubTool();
  var x1 = es.x1, y1 = es.y1, x2 = es.x2, y2 = es.y2;
  var col = es.col, pat = es.patternCanvas;
  if (state.ellipseAnimFrame) { cancelAnimationFrame(state.ellipseAnimFrame); state.ellipseAnimFrame = null; }
  state.ellipseStroke = null;
  settleShape(drawEllipseOnCtx, x1, y1, x2, y2, st, col, pat, 'ellipseAnimFrame', 'ellipseBouncing');
}

export function cancelEllipseStroke() {
  if (!state.ellipseStroke) return;
  if (state.ellipseAnimFrame) { cancelAnimationFrame(state.ellipseAnimFrame); state.ellipseAnimFrame = null; }
  state.ellipseStroke = null;
  state.ovCtx.clearRect(0, 0, state.canvasW, state.canvasH);
}
