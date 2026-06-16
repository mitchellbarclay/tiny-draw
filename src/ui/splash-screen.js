import { startSplashAmbient, stopSplashAmbient } from './splash-ambient.js';

const AGENT_MODE = new URLSearchParams(location.search).has('agent');

export function initSplashScreen() {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  if (AGENT_MODE) { splash.remove(); return; }

  startSplashAmbient(splash);

  function dismiss(callback) {
    stopSplashAmbient();
    splash.classList.add('hiding');
    splash.addEventListener('transitionend', () => {
      splash.remove();
      if (callback) callback();
    }, { once: true });
  }

  document.getElementById('splash-draw-btn').addEventListener('click', () => dismiss());
  document.getElementById('splash-open-btn').addEventListener('click', () => {
    dismiss(() => document.getElementById('open-image-input').click());
  });

  // Install popup
  const popup = document.getElementById('splash-install-popup');

  document.getElementById('splash-install-btn').addEventListener('click', () => {
    popup.classList.add('visible');
  });
  document.getElementById('sip-close-btn').addEventListener('click', () => {
    popup.classList.remove('visible');
  });
  popup.addEventListener('click', (e) => {
    if (e.target === popup) popup.classList.remove('visible');
  });

  // Tab switching
  popup.querySelectorAll('.sip-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      popup.querySelectorAll('.sip-tab').forEach(t => t.classList.remove('active'));
      popup.querySelectorAll('.sip-page').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('sip-page-' + tab.dataset.sipTab).classList.add('active');
    });
  });
}
