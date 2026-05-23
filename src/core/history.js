import state from '../state.js';

export function saveHistory() {
  if (!state.canvasW || !state.canvasH) return;
  state.undoSnapshot = state.ctx.getImageData(0, 0, state.canvas.width, state.canvas.height);
}

export function undoMagic(onComplete) {
  var pts = state.lastStrokePoints;
  var snap = document.createElement('canvas');
  snap.width = state.canvas.width; snap.height = state.canvas.height;
  snap.getContext('2d').putImageData(state.undoSnapshot, 0, 0);
  var current = state.ctx.getImageData(0, 0, state.canvas.width, state.canvas.height);
  var snapCSSW = state.canvasW, snapCSSH = state.canvasH;

  function commit() {
    state.ctx.putImageData(state.undoSnapshot, 0, 0);
    state.undoSnapshot = current;
  }

  var sparkleOrigins = [];
  if (pts && pts.length >= 2) {
    var step = Math.max(1, Math.floor(pts.length / 40));
    for (var i = 0; i < pts.length; i += step) sparkleOrigins.push(pts[i]);
    if (sparkleOrigins[sparkleOrigins.length-1] !== pts[pts.length-1])
      sparkleOrigins.push(pts[pts.length-1]);
  } else {
    sparkleOrigins.push({x: state.canvasW/2, y: state.canvasH/2});
  }

  var particles = [];
  var COUNT = Math.min(60, sparkleOrigins.length * 3);
  for (var i = 0; i < COUNT; i++) {
    var o = sparkleOrigins[Math.floor(Math.random() * sparkleOrigins.length)];
    var angle = Math.random() * Math.PI * 2;
    var speed = 0.4 + Math.random() * 1.2;
    particles.push({
      x: o.x + (Math.random()-0.5)*8,
      y: o.y + (Math.random()-0.5)*8,
      vx: Math.cos(angle)*speed,
      vy: Math.sin(angle)*speed,
      r: 1.5 + Math.random()*2.5,
      delay: Math.random()*0.4,
      life: 0
    });
  }

  var duration = 360;
  var startTime = performance.now();

  function frame() {
    var now = performance.now();
    var t = Math.min(1, (now-startTime)/duration);
    var e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2;

    state.ctx.putImageData(current, 0, 0);
    state.ctx.save();
    state.ctx.globalAlpha = e;
    state.ctx.drawImage(snap, 0, 0, snapCSSW, snapCSSH);
    state.ctx.restore();

    state.ovCtx.clearRect(0, 0, snapCSSW, snapCSSH);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (t < p.delay) continue;
      p.life += 0.045;
      p.x += p.vx; p.y += p.vy;
      var alpha = Math.max(0, Math.sin(Math.min(p.life,1)*Math.PI)) * (1-e);
      if (alpha <= 0) continue;
      state.ovCtx.save();
      state.ovCtx.globalAlpha = alpha * 0.85;
      state.ovCtx.fillStyle = state.color;
      state.ovCtx.beginPath();
      state.ovCtx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      state.ovCtx.fill();
      state.ovCtx.restore();
    }

    if (t < 1) requestAnimationFrame(frame);
    else {
      state.ovCtx.clearRect(0, 0, snapCSSW, snapCSSH);
      commit();
      onComplete();
    }
  }
  frame();
}
