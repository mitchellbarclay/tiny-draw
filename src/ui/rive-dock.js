import state from '../state.js';
import { saveHistory } from '../core/history.js';
import { hexToRgb, hslToRgb } from '../core/color-utils.js';
import { progressiveFloodFill } from '../core/fill.js';
import { doBoom } from '../tools/explosion.js';

var _riveInst = null;
var _dockVM = null;
var _toolVMs = {};
var _active = false;
var _undoBusy = false;
var _bound = false;
var _riveDragging = false;

export function initRiveDock() {
  if (!window.rive) { console.warn('[rive-dock] Rive runtime not loaded'); return; }
  var canvas = document.getElementById('rive-dock-canvas');
  if (!canvas) return;

  _sizeCanvas(canvas);
  window.addEventListener('resize', function() { _sizeCanvas(canvas); });

  _riveInst = new window.rive.Rive({
    src: 'src/rive/rive-dock.riv',
    canvas: canvas,
    artboard: 'Drag tools main',
    stateMachines: 'State Machine 1',
    autoplay: true,
    layout: new window.rive.Layout({ fit: window.rive.Fit.Layout }),
    onLoad: function() {
      _bindViewModels();
    },
    onLoadError: function(e) {
      console.error('[rive-dock] failed to load .riv:', e);
    }
  });

  // Sync fill colour on every frame when state.color changes
  var _lastColor = '';
  _riveInst.on(window.rive.EventType.Advance, function() {
    if (state.color !== _lastColor) {
      _syncFillColor();
      _lastColor = state.color;
    }
  });

  // Pointer event forwarding — capture phase so we can preventDefault before
  // the drawing canvas sees the event (suppresses synthetic mousedown).
  // When the press lands in the dock zone we block drawing; elsewhere it falls
  // through and drawing works normally.
  var DOCK_HIT_PX = 140; // px from bottom of viewport where dock lives

  // pointerdown fires before mousedown — set a global flag in the dock zone so
  // the canvas mousedown handler (in main.js) can bail out without drawing.
  window.addEventListener('pointerdown', function(e) {
    window.__riveDockCapturing = false;
    if (!window.__riveActive) return;
    if (e.clientY > window.innerHeight - DOCK_HIT_PX) {
      _riveDragging = true;
      window.__riveDockCapturing = true;
    }
    if (_riveInst) {
      try { _riveInst.stateMachinePointerDown(e.clientX, e.clientY); } catch(err) {}
    }
  });

  window.addEventListener('pointermove', function(e) {
    if (_active && _riveInst) {
      try { _riveInst.stateMachinePointerMove(e.clientX, e.clientY); } catch(err) {}
    }
  });

  window.addEventListener('pointerup', function(e) {
    window.__riveDockCapturing = false;
    _riveDragging = false;
    if (_active && _riveInst) {
      try { _riveInst.stateMachinePointerUp(e.clientX, e.clientY); } catch(err) {}
    }
  });

  // Touch: canvas's touchstart dispatches a synthetic mousedown, so we must
  // intercept touchstart in capture phase for dock-area touches.
  window.addEventListener('touchstart', function(e) {
    if (!_active || !_riveInst || !e.touches.length) return;
    var t = e.touches[0];
    if (t.clientY > window.innerHeight - DOCK_HIT_PX) {
      _riveInst.stateMachinePointerDown(t.clientX, t.clientY);
      e.stopPropagation(); // prevents canvas touchstart from synthesising mousedown
      _riveDragging = true;
    }
  }, { capture: true, passive: false });

  window.addEventListener('touchmove', function(e) {
    if (!_active || !_riveInst || !e.touches.length || !_riveDragging) return;
    var t = e.touches[0];
    _riveInst.stateMachinePointerMove(t.clientX, t.clientY);
  }, { passive: false });

  window.addEventListener('touchend', function(e) {
    if (!_active || !_riveInst) return;
    if (_riveDragging) {
      var t = e.changedTouches[0];
      _riveInst.stateMachinePointerUp(t.clientX, t.clientY);
      _riveDragging = false;
    }
  });
}

export function setRiveDockActive(active) {
  _active = active;
  window.__riveActive = active;
}

function _sizeCanvas(canvas) {
  var dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}

function _bindViewModels() {
  if (_bound) return;
  _bound = true;
  var vmDef = _riveInst.viewModelByName('DockVM');
  if (!vmDef) { console.warn('[rive-dock] DockVM not found'); return; }

  _dockVM = vmDef.defaultInstance();
  _riveInst.bindViewModelInstance(_dockVM);

  _pushCanvasSize();
  window.addEventListener('resize', _pushCanvasSize);

  var effectTriggerNames = { tornado: 'wipe', dynamite: 'explode', fill: 'fill', undo: 'undo' };

  ['tornado', 'dynamite', 'fill', 'undo'].forEach(function(name) {
    var inst = _dockVM.viewModel(name);
    if (!inst) { console.warn('[rive-dock] missing VM instance for:', name); return; }
    _toolVMs[name] = inst;

    var trigName = effectTriggerNames[name];
    var trig = inst.trigger(trigName);
    if (!trig) { console.warn('[rive-dock] missing trigger:', trigName, 'on', name); return; }

    // Closure to capture toolName
    (function(toolName, t) {
      if (typeof t.on === 'function') {
        t.on(function() {
          var dropX = 0, dropY = 0;
          if (_dockVM) {
            var px = _dockVM.number('dropX');
            var py = _dockVM.number('dropY');
            if (px) dropX = px.value;
            if (py) dropY = py.value;
          }
          console.log('[rive-dock] effect fired:', toolName, 'at', Math.round(dropX), Math.round(dropY));
          _fireEffect(toolName, dropX, dropY);
        });
      } else {
        console.warn('[rive-dock] trigger.on() not available — this Rive runtime may not support VM trigger callbacks');
      }
    })(name, trig);
  });

  _syncFillColor();
  console.log('[rive-dock] ready. Tools bound:', Object.keys(_toolVMs).join(', '));
}

function _pushCanvasSize() {
  if (!_dockVM) return;
  var cw = _dockVM.number('canvasW');
  var ch = _dockVM.number('canvasH');
  if (cw) cw.value = state.canvasW;
  if (ch) ch.value = state.canvasH;
}

function _syncFillColor() {
  var vm = _toolVMs.fill;
  if (!vm) return;
  var prop = vm.color('paintColour');
  if (!prop) return;
  prop.value = _hexToArgb(state.color || '#000000');
}

function _hexToArgb(hex) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return 0xFF000000 >>> 0;
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return ((0xFF << 24) | (r << 16) | (g << 8) | b) >>> 0;
}

function _fireEffect(toolName, dropX, dropY) {
  if (toolName === 'undo') {
    _doUndo();
  } else if (toolName === 'fill') {
    _doFill(dropX, dropY);
  } else if (toolName === 'dynamite') {
    // doBoom calls saveHistory() internally
    doBoom(dropX, dropY);
  } else if (toolName === 'tornado') {
    _doTornadoWipe();
  }
}

// ── Tornado: canvas wipe only — Rive handles the tornado ghost animation ──────

function _doTornadoWipe() {
  saveHistory();
  state.lastStrokePoints = null;
  var w = state.canvasW, h = state.canvasH;
  var topW = Math.min(w * 0.22, 280);
  var lean = Math.max(40, topW * 0.35);
  var startX = -topW * 0.7, endX = w + topW * 0.9;
  var totalFrames = 130, frame = 0;

  function clearWipe(cx) {
    state.ctx.fillStyle = state.BG_CSS;
    state.ctx.beginPath();
    state.ctx.moveTo(-100, -10);
    state.ctx.lineTo(cx + lean, -10);
    state.ctx.lineTo(cx - lean, h + 10);
    state.ctx.lineTo(-100, h + 10);
    state.ctx.closePath();
    state.ctx.fill();
  }

  function animWipe() {
    var p = frame / totalFrames;
    var cx = startX + (endX - startX) * p;
    clearWipe(cx);
    frame++;
    if (frame < totalFrames) {
      requestAnimationFrame(animWipe);
    } else {
      state.ctx.fillStyle = state.BG_CSS;
      state.ctx.fillRect(0, 0, w, h);
      _fireTrigger(_toolVMs.tornado, 'endWipe');
    }
  }
  animWipe();
}

// ── Fill: immediate flood fill, no drip — Rive handles the drip animation ────

function _doFill(dropX, dropY) {
  saveHistory();
  state.lastStrokePoints = null;
  var fc = state.rainbowMode ? 'hsl(' + Math.floor(Math.random() * 360) + ',100%,50%)' : state.color;
  var rgb = fc.indexOf('hsl') === 0 ? hslToRgb(fc) : hexToRgb(fc);
  var sx = Math.round(dropX * state.DPR);
  var sy = Math.round(dropY * state.DPR);
  progressiveFloodFill(sx, sy, rgb, function() {});
}

// ── Undo: sparkle + canvas restore — Rive handles the undo ghost animation ───

function _doUndo() {
  if (_undoBusy || !state.undoSnapshot) return;
  if (state.undoSnapshot.width !== state.canvas.width || state.undoSnapshot.height !== state.canvas.height) return;
  _undoBusy = true;

  var pts = state.lastStrokePoints;
  var snap = document.createElement('canvas');
  snap.width = state.canvas.width;
  snap.height = state.canvas.height;
  snap.getContext('2d').putImageData(state.undoSnapshot, 0, 0);
  var current = state.ctx.getImageData(0, 0, state.canvas.width, state.canvas.height);
  var snapW = state.canvasW, snapH = state.canvasH;

  function commit() {
    state.ctx.putImageData(state.undoSnapshot, 0, 0);
    state.undoSnapshot = current;
  }

  var origins = [];
  if (pts && pts.length >= 2) {
    var step = Math.max(1, Math.floor(pts.length / 40));
    for (var i = 0; i < pts.length; i += step) origins.push(pts[i]);
    if (origins[origins.length - 1] !== pts[pts.length - 1]) origins.push(pts[pts.length - 1]);
  } else {
    origins.push({ x: state.canvasW / 2, y: state.canvasH / 2 });
  }

  var particles = [];
  var COUNT = Math.min(60, origins.length * 3);
  for (var i = 0; i < COUNT; i++) {
    var o = origins[Math.floor(Math.random() * origins.length)];
    var angle = Math.random() * Math.PI * 2;
    var speed = 0.4 + Math.random() * 1.2;
    particles.push({
      x: o.x + (Math.random() - 0.5) * 8, y: o.y + (Math.random() - 0.5) * 8,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      r: 1.5 + Math.random() * 2.5, delay: Math.random() * 0.4, life: 0
    });
  }

  var duration = 360, t0 = performance.now();
  function frame() {
    try {
      var now = performance.now();
      var t = Math.min(1, (now - t0) / duration);
      var ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      state.ctx.putImageData(current, 0, 0);
      state.ctx.save(); state.ctx.globalAlpha = ease;
      state.ctx.drawImage(snap, 0, 0, snapW, snapH);
      state.ctx.restore();
      state.ovCtx.clearRect(0, 0, snapW, snapH);
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        if (t < p.delay) continue;
        p.life += 0.045; p.x += p.vx; p.y += p.vy;
        var alpha = Math.max(0, Math.sin(Math.min(p.life, 1) * Math.PI)) * (1 - ease);
        if (alpha <= 0) continue;
        state.ovCtx.save(); state.ovCtx.globalAlpha = alpha * 0.85;
        state.ovCtx.fillStyle = state.color;
        state.ovCtx.beginPath(); state.ovCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2); state.ovCtx.fill();
        state.ovCtx.restore();
      }
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        state.ovCtx.clearRect(0, 0, snapW, snapH);
        commit();
        setTimeout(function() { _undoBusy = false; }, 180);
      }
    } catch (err) {
      console.error('[rive-dock] undo error:', err);
      commit();
      _undoBusy = false;
    }
  }
  frame();
}

// ── Helper: fire a named trigger on a VM instance ─────────────────────────────

function _fireTrigger(vmInst, triggerName) {
  if (!vmInst) return;
  var t = vmInst.trigger(triggerName);
  if (!t) return;
  if (typeof t.fire === 'function') t.fire();
  else if (typeof t.trigger === 'function') t.trigger();
}
