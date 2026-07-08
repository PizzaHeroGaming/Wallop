// versionCheck.js — "you're out of date, please update" nudge.
//
// Fetches the canonical version manifest from GitHub Pages and, if the running
// build is older than the latest PUBLISHED build for this platform, shows a
// dismissible prompt with a platform-appropriate action:
//   • web     → RELOAD (clears caches / service worker, then hard-reloads)
//   • android → UPDATE (opens the Play Store listing)
//   • steam   → informational (Steam auto-updates on launch)
//
// Everything here is best-effort and MUST fail silently — offline, a missing
// field, a parse error, or a blocked fetch just means "no nudge", never a broken
// game. The prompt is non-blocking (LATER keeps you playing the current build).

import { VERSION } from './config.js?v=270abaa';
import { isSteamBuild } from './renderer.js?v=270abaa';

// Canonical manifest — same-origin on the web build, cross-origin (CORS-allowed)
// from the Capacitor + Electron shells. Cache-busted per fetch.
const MANIFEST_URL = 'https://pizzaherogaming.github.io/Wallop/version.json';

function _platform() {
  if (isSteamBuild()) return 'steam';
  const cap = typeof window !== 'undefined' && window.Capacitor;
  if (cap) {
    try { if (typeof cap.getPlatform === 'function') return cap.getPlatform() === 'ios' ? 'ios' : 'android'; } catch (e) {}
    return 'android'; // native shell present → treat as store build
  }
  return 'web';
}

// Numeric semver-ish compare: returns <0 if a<b, 0 if equal, >0 if a>b.
function _cmp(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

// Skip the check during local dev (web preview on localhost) so it never nags
// while iterating. Capacitor/Electron shells also use localhost-ish origins, so
// only skip when we're plain web AND on a local host.
function _isLocalDev(platform) {
  if (platform !== 'web') return false;
  const h = (typeof location !== 'undefined' && location.hostname) || '';
  return h === 'localhost' || h === '127.0.0.1' || h === '' || h === '0.0.0.0';
}

let _checked = false;
export async function checkForUpdate() {
  if (_checked) return; // once per session
  _checked = true;
  const platform = _platform();
  if (_isLocalDev(platform)) return;

  let manifest;
  try {
    const res = await fetch(MANIFEST_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    manifest = await res.json();
  } catch (e) { return; } // offline / blocked / bad JSON → no nudge

  const latest = manifest && manifest[platform === 'ios' ? 'android' : platform];
  if (!latest || _cmp(VERSION, latest) >= 0) return; // up to date (or ahead)

  _showUpdatePrompt(platform, latest, manifest);
}

function _openExternal(url) {
  if (!url) return;
  // Capacitor: prefer the App/Browser plugin so it opens in the system browser
  // / Play Store app rather than inside the game WebView.
  try {
    const cap = window.Capacitor;
    if (cap && cap.Plugins) {
      if (cap.Plugins.Browser && cap.Plugins.Browser.open) { cap.Plugins.Browser.open({ url }); return; }
      if (cap.Plugins.App && cap.Plugins.App.openUrl) { cap.Plugins.App.openUrl({ url }); return; }
    }
  } catch (e) {}
  try { window.open(url, '_system'); return; } catch (e) {}
  try { window.open(url, '_blank'); return; } catch (e) {}
  try { window.location.href = url; } catch (e) {}
}

async function _reloadFresh() {
  // Best-effort: drop any PWA cache / service worker so the reload pulls the
  // newly-deployed build instead of the stale cached one.
  try {
    if (window.caches && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (e) {}
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch (e) {}
  try { location.reload(); } catch (e) {}
}

function _showUpdatePrompt(platform, latest, manifest) {
  if (document.getElementById('update-overlay')) return;
  let actionLabel, msg;
  if (platform === 'web') {
    actionLabel = 'RELOAD';
    msg = `A newer version (v${latest}) is ready. Reload to get the latest.`;
  } else if (platform === 'steam') {
    actionLabel = 'GOT IT';
    msg = `A newer version (v${latest}) is available. Steam updates it automatically — restart the game to apply.`;
  } else { // android / ios
    actionLabel = 'UPDATE';
    msg = `A newer version (v${latest}) is available. Update to get the latest fixes.`;
  }

  const overlay = document.createElement('div');
  overlay.id = 'update-overlay';
  overlay.innerHTML = `
    <div class="update-card">
      <div class="update-title">UPDATE AVAILABLE</div>
      <div class="update-msg">${msg}</div>
      <div class="update-sub">You're on v${VERSION}</div>
      <div class="update-actions">
        <button class="update-btn update-go">${actionLabel}</button>
        <button class="update-btn update-later">LATER</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.update-later').addEventListener('click', close);
  overlay.querySelector('.update-go').addEventListener('click', () => {
    if (platform === 'web') { _reloadFresh(); }
    else if (platform === 'steam') { close(); }
    else { _openExternal(manifest && manifest.androidUrl); close(); }
  });
}
