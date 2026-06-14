import { openSettings } from './settings-menu.js';

const AGENT_MODE = new URLSearchParams(location.search).has('agent');

export function initSplashScreen() {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  if (AGENT_MODE) { splash.remove(); return; }

  function dismiss(callback) {
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

  document.getElementById('splash-about-btn').addEventListener('click', () => {
    dismiss(() => openSettings(0));
  });

  document.getElementById('splash-install-btn').addEventListener('click', () => {
    dismiss(() => openSettings(1));
  });
}
