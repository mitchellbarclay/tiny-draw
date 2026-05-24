let scrollOffset = 0;
let maxScroll = 0;
let viewport, toolList, upBtn, downBtn;

const STEP = 60;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function updateScroll() {
  maxScroll = Math.max(0, toolList.scrollHeight - viewport.clientHeight);
  scrollOffset = clamp(scrollOffset, 0, maxScroll);
  toolList.style.transform = scrollOffset ? `translateY(${-scrollOffset}px)` : '';
  upBtn.classList.toggle('visible', scrollOffset > 1);
  downBtn.classList.toggle('visible', scrollOffset < maxScroll - 1);
}

export function initToolbarOverflow() {
  viewport = document.getElementById('tool-scroll-viewport');
  toolList = document.getElementById('tool-list');
  upBtn = document.getElementById('tool-overflow-up');
  downBtn = document.getElementById('tool-overflow-down');

  upBtn.addEventListener('click', () => {
    scrollOffset = clamp(scrollOffset - STEP, 0, maxScroll);
    updateScroll();
  });

  downBtn.addEventListener('click', () => {
    scrollOffset = clamp(scrollOffset + STEP, 0, maxScroll);
    updateScroll();
  });

  let dragStartY = 0;
  let dragStartOffset = 0;
  let isDrag = false;

  viewport.addEventListener('pointerdown', e => {
    dragStartY = e.clientY;
    dragStartOffset = scrollOffset;
    isDrag = false;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  });

  function onMove(e) {
    const delta = dragStartY - e.clientY;
    if (!isDrag && Math.abs(delta) > 6) isDrag = true;
    if (isDrag) {
      scrollOffset = clamp(dragStartOffset + delta, 0, maxScroll);
      updateScroll();
    }
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove);
    if (isDrag) {
      viewport.addEventListener('click', e => e.stopPropagation(), { capture: true, once: true });
      isDrag = false;
    }
  }

  viewport.addEventListener('wheel', e => {
    e.preventDefault();
    scrollOffset = clamp(scrollOffset + e.deltaY * 0.5, 0, maxScroll);
    updateScroll();
  }, { passive: false });

  window.addEventListener('resize', updateScroll);
  requestAnimationFrame(updateScroll);
}
