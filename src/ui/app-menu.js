import state from '../state.js';
import { saveHistory } from '../core/history.js';
import { saveDrawing } from './toolbar.js';
import { openAbout, openInstall } from './settings-menu.js';

// Unified morphing menu — single #app-menu container expands from pill to card.

var _menuFaded = false;
var _closeMenu = null; // set by initAppMenu, used by stroke handlers
var _expandedW = 0, _expandedH = 0;
const PILL_W = 130; // pill width matches: 22px pad + "Menu" text + 14px gap + 16px icon + 22px pad
const PILL_H = 47;

export function menuBtnStrokeBegin() {
  const menu = document.getElementById('app-menu');
  if (menu) menu.style.pointerEvents = 'none';
}

export function menuBtnStrokeHit(cx, cy) {
  if (_menuFaded) return;
  const menu = document.getElementById('app-menu');
  if (!menu) return;
  const r = menu.getBoundingClientRect();
  if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
    _menuFaded = true;
    menu.style.opacity = '0';
    if (_closeMenu) _closeMenu();
  }
}

export function menuBtnStrokeEnd() {
  const menu = document.getElementById('app-menu');
  if (menu) {
    menu.style.pointerEvents = '';
    if (_menuFaded) menu.style.opacity = '';
  }
  _menuFaded = false;
}

export function initAppMenu() {
  const menu = document.getElementById('app-menu');
  const pill = menu.querySelector('.app-menu-pill');
  const closeBtn = document.getElementById('app-menu-close');
  const fileInput = document.getElementById('open-image-input');

  // Measure expanded dimensions before the first paint so we know target size.
  // Temporarily expand without transitions (synchronous — no visual flash).
  menu.style.transition = 'none';
  menu.style.width = 'max-content';
  menu.style.height = 'auto';
  menu.style.overflow = 'visible';
  _expandedW = menu.offsetWidth;
  _expandedH = menu.offsetHeight;
  // Collapse back without transitions
  menu.style.width = PILL_W + 'px';
  menu.style.height = PILL_H + 'px';
  menu.style.overflow = 'hidden';
  void menu.offsetHeight; // flush layout before re-enabling transitions
  menu.style.transition = '';

  function open() {
    menu.style.width = _expandedW + 'px';
    menu.style.height = _expandedH + 'px';
    menu.classList.add('open');
  }

  function close() {
    menu.style.width = PILL_W + 'px';
    menu.style.height = PILL_H + 'px';
    menu.classList.remove('open');
  }

  _closeMenu = close;

  // Clicking the pill (or the container when closed) opens the menu.
  pill.addEventListener('click', (e) => { e.stopPropagation(); open(); });
  menu.addEventListener('contextmenu', (e) => e.preventDefault());
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });

  // Dismiss on any press outside the menu, or Escape.
  document.addEventListener('pointerdown', (e) => {
    if (!menu.classList.contains('open')) return;
    if (menu.contains(e.target)) return;
    close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  menu.querySelectorAll('.app-menu-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      close();
      if (action === 'about') openAbout();
      else if (action === 'install') openInstall();
      else if (action === 'save') saveDrawing();
      else if (action === 'open') fileInput.click();
    });
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) loadImageFile(file);
    fileInput.value = '';
  });
}

// Draw an opened image onto the canvas, fit (contain) and centred over a fresh
// background. Snapshots first so the dock's undo restores the prior drawing.
function loadImageFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    saveHistory();
    const ctx = state.ctx, W = state.canvasW, H = state.canvasH;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = state.BG_CSS;
    ctx.fillRect(0, 0, W, H);
    const scale = Math.min(W / img.width, H / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.restore();
    URL.revokeObjectURL(url);
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}
