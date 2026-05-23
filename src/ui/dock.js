export function initDock() {
  var shelf = document.getElementById('drag-shelf');
  var toggle = document.getElementById('dock-toggle');
  var area = document.getElementById('canvas-area');
  var dockPos = 'bottom';
  var EDGE = 18;
  var lastToggleAt = 0;

  function topPxFor(p) {
    var ch = area.clientHeight;
    var sh = shelf.offsetHeight;
    return p === 'top' ? EDGE : Math.max(EDGE, ch - sh - EDGE);
  }
  function applyPos(instant) {
    var icon = toggle.querySelector('.mir');
    if (instant) {
      shelf.style.transition = 'none';
      shelf.style.opacity = '1';
      shelf.style.top = topPxFor(dockPos) + 'px';
      shelf.setAttribute('data-dock-pos', dockPos);
      icon.textContent = dockPos === 'bottom' ? 'expand_less' : 'expand_more';
      return;
    }
    shelf.style.transition = 'opacity 0.32s ease';
    shelf.style.opacity = '0';
    setTimeout(function() {
      shelf.style.transition = 'none';
      shelf.style.top = topPxFor(dockPos) + 'px';
      shelf.setAttribute('data-dock-pos', dockPos);
      icon.textContent = dockPos === 'bottom' ? 'expand_less' : 'expand_more';
      shelf.offsetHeight;
      shelf.style.transition = 'opacity 0.55s ease';
      shelf.style.opacity = '1';
    }, 340);
  }
  function togglePos() {
    var now = Date.now();
    if (now - lastToggleAt < 920) return;
    lastToggleAt = now;
    dockPos = (dockPos === 'bottom') ? 'top' : 'bottom';
    applyPos();
  }

  toggle.addEventListener('click', function(e) { e.stopPropagation(); togglePos(); });
  toggle.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
  toggle.addEventListener('mousedown', function(e) { e.stopPropagation(); });
  toggle.addEventListener('touchstart', function(e) { e.stopPropagation(); }, {passive: true});

  requestAnimationFrame(function() { applyPos(true); });
  setTimeout(function() { applyPos(true); }, 0);
  setTimeout(function() { applyPos(true); }, 100);
  window.addEventListener('load', function() { applyPos(true); });
  window.addEventListener('resize', function() { applyPos(true); });

  window.__dockStrokeHit = function(cx, cy) {
    if (cx == null || cy == null) return;
    if (Date.now() - lastToggleAt < 480) return;
    var r = shelf.getBoundingClientRect();
    if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
      togglePos();
    }
  };

  var canvas = document.getElementById('c');
  function setPassthrough(on) { shelf.classList.toggle('stroke-passthrough', !!on); }
  canvas.addEventListener('mousedown', function() { setPassthrough(true); });
  window.addEventListener('mouseup', function() { setPassthrough(false); });
  canvas.addEventListener('touchstart', function() { setPassthrough(true); }, {passive: true});
  window.addEventListener('touchend', function() { setPassthrough(false); });
  window.addEventListener('touchcancel', function() { setPassthrough(false); });
}
