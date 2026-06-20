import state from '../state.js';
import { parseColorRgb, rgbToHsl, hslToRgbCss } from '../core/color-utils.js';

var BUBBLE_GROW_MS = 700;

function easeOutFastSlow(t) { return Math.pow(t, 0.3); }

function drawBubble(bctx, px, py, r, rgb) {
  if (r < 1) return;
  bctx.save();
  bctx.globalAlpha = 1;
  bctx.beginPath(); bctx.arc(px, py, r, 0, Math.PI*2); bctx.clip();
  var bg = bctx.createRadialGradient(px, py, 0, px, py, r);
  bg.addColorStop(0,    'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0.12)');
  bg.addColorStop(0.58, 'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0.32)');
  bg.addColorStop(0.78, 'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0.78)');
  bg.addColorStop(0.91, 'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0.95)');
  bg.addColorStop(1.0,  'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0.55)');
  bctx.fillStyle = bg; bctx.fill();
  var hx = px - r*0.28, hy = py - r*0.28;
  var hiG = bctx.createRadialGradient(hx, hy, 0, hx, hy, r*0.62);
  hiG.addColorStop(0, 'rgba(255,255,255,0.50)');
  hiG.addColorStop(1, 'rgba(255,255,255,0)');
  bctx.fillStyle = hiG; bctx.fill();
  var dotG = bctx.createRadialGradient(hx, hy, 0, hx, hy, r*0.22);
  dotG.addColorStop(0, 'rgba(255,255,255,0.95)');
  dotG.addColorStop(1, 'rgba(255,255,255,0)');
  bctx.fillStyle = dotG; bctx.fill();
  bctx.restore();
}

// Render each bubble's gradients exactly once into an offscreen sprite, then
// blit (drawImage) it every frame. drawImage is cheap; recreating three radial
// gradients per particle per frame is not — this is the iPad perf win.
function bubbleSprite(p) {
  if (p.sprite) return p.sprite;
  var r = p.targetR;
  var pad = Math.max(2, r * 0.08);
  var half = r + pad;
  var dpr = state.DPR || 2;
  var pxSize = Math.max(2, Math.ceil(half * 2 * dpr));
  var cv;
  if (typeof OffscreenCanvas !== 'undefined') {
    cv = new OffscreenCanvas(pxSize, pxSize);
  } else {
    cv = document.createElement('canvas');
    cv.width = pxSize; cv.height = pxSize;
  }
  var sctx = cv.getContext('2d');
  sctx.scale(dpr, dpr);
  drawBubble(sctx, half, half, r, p.rgb);
  p.sprite = { canvas: cv, half: half };
  return p.sprite;
}

function blitBubble(dctx, p, r) {
  var s = bubbleSprite(p);
  var scale = r / p.targetR;
  var size = s.half * 2 * scale;
  dctx.drawImage(s.canvas, p.x - s.half * scale, p.y - s.half * scale, size, size);
}

function splatterOverlayFrame() {
  var now = performance.now();
  var stillGrowing = [];
  state.ovCtx.clearRect(0, 0, state.canvasW, state.canvasH);
  for (var pi = 0; pi < state.splatterParticles.length; pi++) {
    var p = state.splatterParticles[pi];
    var t = Math.max(0, Math.min(1, (now - p.born) / BUBBLE_GROW_MS));
    var curR = p.targetR * easeOutFastSlow(t);
    if (t >= 1) {
      blitBubble(state.ctx, p, p.targetR);
    } else {
      blitBubble(state.ovCtx, p, curR);
      stillGrowing.push(p);
    }
  }
  state.splatterParticles = stillGrowing;
  if (state.splatterParticles.length > 0) {
    state.splatterAnimId = requestAnimationFrame(splatterOverlayFrame);
  } else {
    state.splatterAnimId = null;
  }
}

export function commitAllSplatterParticles() {
  if (state.splatterAnimId) { cancelAnimationFrame(state.splatterAnimId); state.splatterAnimId = null; }
  for (var pi = 0; pi < state.splatterParticles.length; pi++) {
    blitBubble(state.ctx, state.splatterParticles[pi], state.splatterParticles[pi].targetR);
  }
  state.splatterParticles = [];
  state.ovCtx.clearRect(0, 0, state.canvasW, state.canvasH);
}

export function drawSplatterStroke(x, y) {
  var gapNeeded = state.brushSize * 0.55;
  var moved = state.splatterGateX === null ? Infinity : Math.hypot(x - state.splatterGateX, y - state.splatterGateY);
  if (moved >= gapNeeded) {
    state.splatterGateX = x; state.splatterGateY = y;
    var dotCount = Math.max(2, Math.round(state.brushSize * 0.14));
    var splatterStart = state.splatterParticles.length;
    for (var bi = 0; bi < dotCount; bi++) {
      var dotR = 3 + Math.random() * state.brushSize * 0.55;
      var baseC = state.rainbowMode ? 'hsl('+Math.floor(Math.random()*360)+',80%,62%)' : state.color;
      var rgb0 = parseColorRgb(baseC);
      var hsl0 = rgbToHsl(rgb0[0], rgb0[1], rgb0[2]);
      var h0 = hsl0[0] + (Math.random()-0.5)*30;
      var s0 = Math.max(0.2, Math.min(1, hsl0[1] + (Math.random()-0.5)*0.18));
      var l0 = Math.max(0.35, Math.min(0.88, hsl0[2] + 0.08 + Math.random()*0.12));
      var bx = x + (Math.random()-0.5)*state.brushSize*2.5;
      var by = y + (Math.random()-0.5)*state.brushSize*2.5;
      var dist = Math.hypot(bx-x, by-y);
      var delay = (dist / (state.brushSize * 1.25)) * 40;
      state.splatterParticles.push({
        x: bx, y: by,
        targetR: dotR,
        rgb: parseColorRgb(hslToRgbCss(h0, s0, l0)),
        born: performance.now() + delay,
        sprite: null
      });
    }
    if (state.mirrorMode) {
      var splatterEnd = state.splatterParticles.length;
      for (var mi = splatterStart; mi < splatterEnd; mi++) {
        var mp = state.splatterParticles[mi];
        state.splatterParticles.push({x: state.canvasW - mp.x, y: mp.y, targetR: mp.targetR, rgb: mp.rgb, born: mp.born, sprite: null});
      }
    }
    if (!state.splatterAnimId) {
      state.splatterAnimId = requestAnimationFrame(splatterOverlayFrame);
    }
  }
}
