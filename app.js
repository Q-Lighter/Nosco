// app.js — entry point. Handles first-run password setup, the unlock flow,
// and switching between the Ledger and Dossier views once unlocked.

import { generateSalt, deriveKey, encryptData, decryptData, saltToBase64, saltFromBase64 } from './crypto.js';
import { getSaltRecord, setSaltRecord, getVault, setVault, hasExistingVault } from './storage.js';

const root = document.getElementById('app');

// In-memory only — never written to disk. Cleared on lock.
let sessionKey = null;
let data = null; // { ledger: [], dossier: [], links: [] }

const emptyVault = () => ({ ledger: [], dossier: [], links: [] });

async function saveVault() {
  const record = await encryptData(sessionKey, data);
  await setVault(record);
}

function lock() {
  sessionKey = null;
  data = null;
  renderLockScreen();
}

// ---------- Screens ----------

async function renderLockScreen() {
  const existing = await hasExistingVault();
  root.innerHTML = `
    <div class="lock-screen">
      <div class="lock-mark">N O S C O</div>
      <h1 class="lock-title">${existing ? 'Welcome back' : 'Set your password'}</h1>
      <p class="lock-sub">${existing
        ? 'Enter your password to unlock your data.'
        : 'This password encrypts everything you store here. There is no recovery — if it\'s lost, the data is unreadable.'}</p>
      <form id="lock-form" class="lock-form">
        <input type="password" id="pw" class="lock-input" placeholder="Password" autocomplete="${existing ? 'current-password' : 'new-password'}" required />
        ${!existing ? '<input type="password" id="pw2" class="lock-input" placeholder="Confirm password" required />' : ''}
        <button type="submit" class="lock-btn">${existing ? 'Unlock' : 'Create vault'}</button>
        <p id="lock-error" class="lock-error"></p>
      </form>
    </div>
  `;

  document.getElementById('lock-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = document.getElementById('pw').value;
    const errorEl = document.getElementById('lock-error');
    errorEl.textContent = '';

    try {
      if (existing) {
        const saltB64 = await getSaltRecord();
        const key = await deriveKey(pw, saltFromBase64(saltB64));
        const record = await getVault();
        data = await decryptData(key, record); // throws if password is wrong
        sessionKey = key;
        renderShell();
      } else {
        const pw2 = document.getElementById('pw2').value;
        if (pw !== pw2) { errorEl.textContent = 'Passwords don\'t match.'; return; }
        if (pw.length < 8) { errorEl.textContent = 'Use at least 8 characters.'; return; }

        const salt = generateSalt();
        const key = await deriveKey(pw, salt);
        await setSaltRecord(saltToBase64(salt));
        sessionKey = key;
        data = emptyVault();
        await saveVault();
        renderShell();
      }
    } catch (err) {
      errorEl.textContent = 'Incorrect password.';
    }
  });
}

function renderShell() {
  root.innerHTML = `
    <div class="shell">
      <nav class="tabbar">
        <div class="tabbar-mark">NOSCO</div>
        <div class="tabs">
          <button class="tab active" data-tab="ledger">Ledger</button>
          <button class="tab" data-tab="dossier">Dossier</button>
        </div>
        <button class="lock-toggle" id="lock-btn">Lock</button>
      </nav>
      <main id="view" class="view"></main>
    </div>
  `;

  document.getElementById('lock-btn').addEventListener('click', lock);
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      renderView(btn.dataset.tab);
    });
  });

  renderView('ledger');
}

function renderView(tab) {
  const view = document.getElementById('view');
  if (tab === 'ledger') {
    view.innerHTML = `
      <div class="placeholder">
        <h2>Ledger</h2>
        <p>Entries, monthly pages, and charts land here next. Your vault currently holds
        <strong>${data.ledger.length}</strong> ledger ${data.ledger.length === 1 ? 'entry' : 'entries'}.</p>
      </div>`;
  } else {
    view.innerHTML = `
      <div class="placeholder">
        <h2>Dossier</h2>
        <p>Person profiles and the node map land here next. Your vault currently holds
        <strong>${data.dossier.length}</strong> ${data.dossier.length === 1 ? 'profile' : 'profiles'}.</p>
      </div>`;
  }
}

// ---------- Boot ----------
renderLockScreen();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Offline caching just won't be active this session — the app still works online.
    });
  });
}
