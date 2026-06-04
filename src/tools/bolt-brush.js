import state from '../state.js';

// --- Tuning -----------------------------------------------------------------
// A bolt stroke is now one continuous recorded path. Each point carries a
// timestamp; once a point is older than LIFE_MS it "expires" out of the live
// animated tail and bakes into permanent ink. This means:
//   * the live tail follows every recorded point (no chord-gap on fast flicks),
//   * the animation settles on its own a moment after you stop moving,
//   * and it always bakes fully on release (never crackles forever).
var LIFE_MS = 240;        // how long a point stays in the live, animated tail
var CRACKLE_MS = 60;      // regenerate the live fractal at most this often (flicker)

function bakeMinLen() { return Math.max(70, state.brushSize * 6); }

// --- Fractal + drawing primitives -------------------------------------------
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

// Build one fractal lightning that threads through every point of a polyline.
// Each straight segment is independently subdivided, so the bolt bends with the
// recorded path instead of cutting a straight chord across fast movement.
function boltAcrossPath(pts) {
  if (!pts || pts.length < 2) return null;
  var out = [{x:pts[0].x, y:pts[0].y}];
  for (var i = 1; i < pts.length; i++) {
    var a = pts[i-1], b = pts[i];
    var len = Math.hypot(b.x-a.x, b.y-a.y);
    if (len < 3) { out.push({x:b.x, y:b.y}); continue; }
    var depth = Math.min(5, 2+Math.floor(Math.log2(Math.max(1, len/10))));
    var seg = fractalBolt(a.x, a.y, b.x, b.y, depth, len*0.72, null);
    out = out.concat(seg.slice(1)); // slice(1) drops the duplicated shared start point
  }
  return out;
}

function renderBolt(targetCtx, jaggedPts, col) {
  if (!jaggedPts || jaggedPts.length < 2) return;
  var w = Math.max(2, state.brushSize*0.70);
  strokeBoltGlow(targetCtx, jaggedPts, col, w);
  drawBoltPath(targetCtx, jaggedPts, '#fff', Math.max(1, w*0.40), 0.95);
}

// Bake the polyline chunk straight onto the main canvas (permanent ink).
function bakePath(pts, col) {
  renderBolt(state.ctx, boltAcrossPath(pts), col);
}

// --- Per-stroke processing --------------------------------------------------
function pathLen(pts, from, to) {
  var L = 0;
  for (var j = from; j < to; j++) L += Math.hypot(pts[j+1].x-pts[j].x, pts[j+1].y-pts[j].y);
  return L;
}

// Advance baking for one stroke (main or mirror) and draw its live tail onto
// the overlay. Returns nothing; mutates bs.bakedThrough and the overlay.
function processStroke(bs, now) {
  var n = bs.pts.length;
  if (n < 2) return;

  // How far has the expired (older than LIFE_MS) region grown past what we've
  // already baked? expireIdx is the last contiguous expired index.
  var expireIdx = bs.bakedThrough;
  for (var k = bs.bakedThrough+1; k < n; k++) {
    if (now - bs.pts[k].t > LIFE_MS) expireIdx = k; else break;
  }
  if (expireIdx > bs.bakedThrough) {
    var regionLen = pathLen(bs.pts, bs.bakedThrough, expireIdx);
    var idle = now - bs.pts[n-1].t; // time since the cursor last moved
    // Bake in chunks of ~bakeMinLen to keep seams sparse during fast drawing,
    // but if the cursor has gone idle, flush whatever has expired so the bolt
    // settles into permanent ink instead of hovering on the overlay.
    if (regionLen >= bakeMinLen() || idle > LIFE_MS) {
      // Include the shared boundary point so baked ink joins the live tail.
      bakePath(bs.pts.slice(bs.bakedThrough, expireIdx+1), bs.col);
      bs.bakedThrough = expireIdx;
    }
  }

  // Live, crackling tail: everything not yet baked. Regenerate the jagged shape
  // on the CRACKLE_MS cadence so it flickers like real lightning rather than
  // strobing every frame.
  var tail = bs.pts.slice(bs.bakedThrough);
  if (tail.length >= 2) {
    if (!bs.liveShape || (now - bs.liveAt) >= CRACKLE_MS || bs.liveCount !== tail.length) {
      bs.liveShape = boltAcrossPath(tail);
      bs.liveAt = now;
      bs.liveCount = tail.length;
    }
    renderBolt(state.ovCtx, bs.liveShape, bs.col);
  }
}

function boltOverlayFrame() {
  var hasMain   = !!state.boltStroke;
  var hasMirror = state.mirrorMode && !!state.mirrorBoltStroke;
  if (!hasMain && !hasMirror) {
    state.ovCtx.clearRect(0,0,state.canvasW,state.canvasH);
    state.boltAnimFrame = null;
    return;
  }
  var now = performance.now();
  state.ovCtx.clearRect(0,0,state.canvasW,state.canvasH);
  if (state.boltStroke) processStroke(state.boltStroke, now);
  if (hasMirror) processStroke(state.mirrorBoltStroke, now);
  state.boltAnimFrame = requestAnimationFrame(boltOverlayFrame);
}

// --- Public API -------------------------------------------------------------
export function drawBoltStroke(x, y, col) {
  if (!state.boltStroke) {
    state.boltStroke = {pts:[{x:x, y:y, t:performance.now()}], col:col, bakedThrough:0, liveShape:null, liveAt:0, liveCount:0};
  } else {
    var bs = state.boltStroke;
    bs.col = col;
    bs.pts.push({x:x, y:y, t:performance.now()});
  }
  // One shared animation loop drives both the main and mirror tails; the guard
  // keeps the mirror pass from starting a second, uncancellable loop.
  if (!state.boltAnimFrame) state.boltAnimFrame = requestAnimationFrame(boltOverlayFrame);
}

function bakeRemaining(bs) {
  if (!bs) return;
  var tail = bs.pts.slice(bs.bakedThrough);
  if (tail.length >= 2) bakePath(tail, bs.col);
  bs.bakedThrough = bs.pts.length - 1;
}

export function finalizeBoltStroke() {
  if (state.boltStroke) { bakeRemaining(state.boltStroke); state.boltStroke = null; }
  if (state.mirrorBoltStroke) { bakeRemaining(state.mirrorBoltStroke); state.mirrorBoltStroke = null; }
  if (state.boltAnimFrame) { cancelAnimationFrame(state.boltAnimFrame); state.boltAnimFrame = null; }
  state.ovCtx.clearRect(0, 0, state.canvasW, state.canvasH);
}
