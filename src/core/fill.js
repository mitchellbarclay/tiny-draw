import state from '../state.js';
import { hexToRgb, hslToRgb } from './color-utils.js';

var POUR_VX0 = -1.5, POUR_FRICTION = 0.93, POUR_GRAVITY = 0.34;
var POUR_SPAWN_DX = -15, POUR_SPAWN_DY = 0;
var POUR_FALL = 80;

export function flattenCanvas() {
  var w = state.canvas.width, h = state.canvas.height;
  var img = state.ctx.getImageData(0, 0, w, h), d = img.data;
  for (var i = 0; i < d.length; i += 4) {
    if (d[i+3] < 255) {
      var a = d[i+3]/255;
      d[i]   = Math.round(d[i]*a   + state.BG[0]*(1-a));
      d[i+1] = Math.round(d[i+1]*a + state.BG[1]*(1-a));
      d[i+2] = Math.round(d[i+2]*a + state.BG[2]*(1-a));
      d[i+3] = 255;
    }
  }
  state.ctx.putImageData(img, 0, 0);
}

export function doFill(sx, sy) {
  flattenCanvas();
  var w = state.canvas.width, h = state.canvas.height;
  var img = state.ctx.getImageData(0, 0, w, h), data = img.data;
  var idx = (sy*w+sx)*4;
  var tr = data[idx], tg = data[idx+1], tb = data[idx+2], ta = data[idx+3];
  var tol = state.fillTolerance;
  var fc = state.rainbowMode ? 'hsl('+Math.floor(Math.random()*360)+',100%,50%)' : state.color;
  var rgb = fc.indexOf('hsl') === 0 ? hslToRgb(fc) : hexToRgb(fc);
  var fr = rgb[0], fg = rgb[1], fb = rgb[2];
  var stack = [[sx, sy]], vis = new Uint8Array(w*h);
  while (stack.length) {
    var pt = stack.pop(); var x = pt[0], y = pt[1];
    if (x < 0 || x >= w || y < 0 || y >= h || vis[y*w+x]) continue;
    var i = (y*w+x)*4;
    if (Math.abs(data[i]-tr)>tol || Math.abs(data[i+1]-tg)>tol || Math.abs(data[i+2]-tb)>tol || Math.abs(data[i+3]-ta)>tol) continue;
    vis[y*w+x] = 1; data[i] = fr; data[i+1] = fg; data[i+2] = fb; data[i+3] = 255;
    stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
  }
  state.ctx.putImageData(img, 0, 0);
}

export function progressiveFloodFill(sx, sy, rgb, onDone) {
  flattenCanvas();
  var w = state.canvas.width, h = state.canvas.height;
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) { onDone(); return; }
  var img = state.ctx.getImageData(0, 0, w, h), data = img.data;
  var p0 = sy*w + sx;
  var idx0 = p0*4, tr = data[idx0], tg = data[idx0+1], tb = data[idx0+2], ta = data[idx0+3];
  var tol = state.fillTolerance;
  var fr = rgb[0], fg = rgb[1], fb = rgb[2];

  var vis = new Uint8Array(w*h);
  var queue = new Int32Array(w*h);
  var qHead = 0, qTail = 0;
  queue[qTail++] = p0; vis[p0] = 1;
  var targets = new Int32Array(w*h), tCount = 0;
  while (qHead < qTail) {
    var p = queue[qHead++];
    var i = p*4;
    if (Math.abs(data[i]-tr)>tol || Math.abs(data[i+1]-tg)>tol || Math.abs(data[i+2]-tb)>tol || Math.abs(data[i+3]-ta)>tol) continue;
    targets[tCount++] = p;
    var px = p%w, py = (p-px)/w;
    if (px+1 < w)  { var n = p+1; if (!vis[n]) { vis[n]=1; queue[qTail++]=n; } }
    if (px > 0)    { var n = p-1; if (!vis[n]) { vis[n]=1; queue[qTail++]=n; } }
    if (py+1 < h)  { var n = p+w; if (!vis[n]) { vis[n]=1; queue[qTail++]=n; } }
    if (py > 0)    { var n = p-w; if (!vis[n]) { vis[n]=1; queue[qTail++]=n; } }
  }
  if (!tCount) { onDone(); return; }

  var cx = sx, cy = Math.min(h-1, sy+30);
  var maxDistSq = 0;
  for (var k = 0; k < tCount; k++) {
    var pp = targets[k], ppx = pp%w, ppy = (pp-ppx)/w;
    var ddx = ppx-cx, ddy = ppy-cy;
    var dsq = ddx*ddx+ddy*ddy;
    if (dsq > maxDistSq) maxDistSq = dsq;
  }
  var maxDist = Math.sqrt(maxDistSq);
  var startTime = performance.now(), duration = 1000;
  var committed = new Uint8Array(tCount);

  function frame() {
    var elapsed = performance.now() - startTime;
    var t = Math.min(1, elapsed/duration);
    var eased = 1 - Math.pow(1-t, 2);
    var radius = maxDist * eased;
    var radiusSq = radius*radius;
    var done = t >= 1;
    var dxMin = w, dxMax = -1, dyMin = h, dyMax = -1;
    for (var k = 0; k < tCount; k++) {
      if (committed[k]) continue;
      var pp = targets[k], ppx = pp%w, ppy = (pp-ppx)/w;
      var ddx = ppx-cx, ddy = ppy-cy;
      if (!done && ddx*ddx+ddy*ddy > radiusSq) continue;
      committed[k] = 1;
      var ii = pp*4;
      data[ii] = fr; data[ii+1] = fg; data[ii+2] = fb; data[ii+3] = 255;
      if (ppx < dxMin) dxMin = ppx; if (ppx > dxMax) dxMax = ppx;
      if (ppy < dyMin) dyMin = ppy; if (ppy > dyMax) dyMax = ppy;
    }
    if (dxMax >= dxMin) {
      state.ctx.putImageData(img, 0, 0, dxMin, dyMin, dxMax-dxMin+1, dyMax-dyMin+1);
    }
    if (!done) requestAnimationFrame(frame);
    else onDone();
  }
  frame();
}

export function computeBucketPos(targetX, targetY) {
  var n = Math.max(1, Math.round((1+Math.sqrt(1+8*POUR_FALL/POUR_GRAVITY))/2));
  var horizDrift = POUR_VX0*(1-Math.pow(POUR_FRICTION,n))/(1-POUR_FRICTION);
  return {
    bx: Math.round(targetX - POUR_SPAWN_DX - horizDrift),
    by: Math.round(targetY - POUR_SPAWN_DY - POUR_FALL)
  };
}

export function paintStream(spawnX, spawnY, landingX, landingY, rgb, spawnDurationMs, onLanding, onDone) {
  var col = 'rgb('+rgb[0]+','+rgb[1]+','+rgb[2]+')';
  var startTime = performance.now();
  var drops = [];
  var deathY = landingY;
  var landed = false;

  function frame() {
    var elapsed = performance.now() - startTime;
    var spawning = elapsed < spawnDurationMs;
    if (spawning) {
      for (var i = 0; i < 2; i++) {
        drops.push({
          x: spawnX + (Math.random()-0.5)*4,
          y: spawnY + (Math.random()-0.5)*6,
          vx: POUR_VX0 - 0.35 + (Math.random()-0.5)*0.6,
          vy: 0,
          r: 3 + Math.random()*3
        });
      }
    }
    state.ovCtx.clearRect(0, 0, state.canvasW, state.canvasH);

    var fadeMs = 300;
    var shadowAlpha = spawning ? 0.22 : Math.max(0, 0.22*(1-(elapsed-spawnDurationMs)/fadeMs));
    if (shadowAlpha > 0) {
      var scx = landingX, scy = (spawnY+deathY)/2;
      var rad = 46;
      var grad = state.ovCtx.createRadialGradient(scx, scy, 0, scx, scy, rad);
      grad.addColorStop(0, 'rgba(0,0,0,'+shadowAlpha+')');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      state.ovCtx.save();
      state.ovCtx.translate(scx, scy); state.ovCtx.scale(0.7, 1.5); state.ovCtx.translate(-scx, -scy);
      state.ovCtx.fillStyle = grad;
      state.ovCtx.fillRect(scx-rad, scy-rad, rad*2, rad*2);
      state.ovCtx.restore();
    }

    for (var i = drops.length-1; i >= 0; i--) {
      var d = drops[i];
      d.x += d.vx; d.y += d.vy; d.vx *= POUR_FRICTION; d.vy += POUR_GRAVITY;
      if (!landed && d.y >= deathY-6) { landed = true; if (onLanding) onLanding(); }
      if (d.y > deathY) { drops.splice(i, 1); continue; }
      state.ovCtx.beginPath();
      state.ovCtx.arc(d.x, d.y, d.r, 0, Math.PI*2);
      state.ovCtx.fillStyle = col;
      state.ovCtx.fill();
    }
    if (drops.length || spawning) {
      requestAnimationFrame(frame);
    } else {
      state.ovCtx.clearRect(0, 0, state.canvasW, state.canvasH);
      if (onDone) onDone();
    }
  }
  frame();
}

export function bucketPour(sx, sy, ghostEl, onDone) {
  var fc = state.rainbowMode ? 'hsl('+Math.floor(Math.random()*360)+',100%,50%)' : state.color;
  var rgb = fc.indexOf('hsl') === 0 ? hslToRgb(fc) : hexToRgb(fc);
  var landingX = sx, landingY = sy;
  var bucketPos = computeBucketPos(landingX, landingY);
  var spawnX = bucketPos.bx + POUR_SPAWN_DX;
  var spawnY = bucketPos.by + POUR_SPAWN_DY;
  var canvasRect = state.canvasArea.getBoundingClientRect();
  ghostEl.style.transition = 'left 0.22s ease-out, top 0.22s ease-out, transform 0.28s cubic-bezier(0.34,1.56,0.64,1)';
  ghostEl.style.left = (canvasRect.left + bucketPos.bx) + 'px';
  ghostEl.style.top  = (canvasRect.top  + bucketPos.by) + 'px';
  ghostEl.style.transform = 'translate(-50%,-50%) rotate(-80deg)';
  setTimeout(function() {
    paintStream(spawnX, spawnY, landingX, landingY, rgb, 240,
      function() {
        progressiveFloodFill(Math.round(landingX*state.DPR), Math.round(landingY*state.DPR), rgb, function() {});
      },
      function() {
        ghostEl.style.transform = 'translate(-50%,-50%) rotate(0deg)';
        setTimeout(onDone, 150);
      }
    );
  }, 260);
}
