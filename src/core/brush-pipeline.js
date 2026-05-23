import { parseColorRgb } from './color-utils.js';

var stampCache = {};
var stampCacheKeys = [];
var STAMP_CACHE_LIMIT = 512;

function rememberStamp(key, sc) {
  stampCache[key] = sc;
  stampCacheKeys.push(key);
  if (stampCacheKeys.length > STAMP_CACHE_LIMIT) {
    var old = stampCacheKeys.shift();
    delete stampCache[old];
  }
}

export function getBrushStamp(r, css) {
  r = Math.max(1, r);
  var key = r + '|' + css;
  var hit = stampCache[key]; if (hit) return hit;
  var pad = 2, size = Math.ceil(2*r)+1+pad*2;
  var sc = document.createElement('canvas'); sc.width = size; sc.height = size;
  var sctx = sc.getContext('2d');
  var cx = size/2, cy = size/2;
  sctx.beginPath();
  sctx.arc(cx, cy, r, 0, Math.PI*2);
  sctx.fillStyle = css;
  sctx.fill();
  rememberStamp(key, sc);
  return sc;
}

export function getEraserStamp(r) {
  r = Math.max(1, r);
  var key = 'E|' + r; var hit = stampCache[key]; if (hit) return hit;
  var pad = 2, size = Math.ceil(2*r)+1+pad*2;
  var sc = document.createElement('canvas'); sc.width = size; sc.height = size;
  var sctx = sc.getContext('2d');
  var cx = size/2, cy = size/2;
  sctx.beginPath();
  sctx.arc(cx, cy, r, 0, Math.PI*2);
  sctx.fillStyle = '#000';
  sctx.fill();
  rememberStamp(key, sc);
  return sc;
}

export function stampDot(targetCtx, x, y, stamp) {
  var hw = stamp.width/2, hh = stamp.height/2;
  targetCtx.drawImage(stamp, x-hw, y-hh);
}

export function stampLine(targetCtx, x0, y0, x1, y1, stamp) {
  var dx = x1-x0, dy = y1-y0;
  var dist = Math.sqrt(dx*dx + dy*dy);
  var steps = Math.max(1, Math.ceil(dist));
  var sx = dx/steps, sy = dy/steps;
  var hw = stamp.width/2, hh = stamp.height/2;
  var lx = NaN, ly = NaN;
  for (var i = 0; i <= steps; i++) {
    var px = x0+sx*i, py = y0+sy*i;
    if (Math.abs(px-lx) < 0.5 && Math.abs(py-ly) < 0.5) continue;
    lx = px; ly = py;
    targetCtx.drawImage(stamp, px-hw, py-hh);
  }
}
