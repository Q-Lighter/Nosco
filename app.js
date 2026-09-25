// app.js — entry point. Handles first-run password setup, the unlock flow,
// navigation, and the Ledger view. Dossier is still a placeholder (next up).

import { generateSalt, deriveKey, encryptData, decryptData, saltToBase64, saltFromBase64 } from './crypto.js';
import { getSaltRecord, setSaltRecord, getVault, setVault, hasExistingVault } from './storage.js';
import {
  addEntry, deleteEntry, entriesForMonth, categoryTotals, monthlyIncomeExpense,
  searchEntries, allCategories, formatMonthLabel, currentMonthKey, shiftMonth, monthKey,
} from './ledger.js';
import { renderPieChart, renderLineChart } from './charts.js';

const root = document.getElementById('app');

// In-memory only — never written to disk. Cleared on lock.
let sessionKey = null;
let data = null; // { ledger: [], dossier: [], links: [] }
const state = { currentMonth: currentMonthKey() };

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

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Lock / setup screen ----------

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

// ---------- Shell / navigation ----------

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
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      btn.classList.add('active');
      renderView(btn.dataset.tab);
    });
  });

  renderView('ledger');
}

function renderView(tab) {
  if (tab === 'ledger') renderLedgerView();
  else renderDossierPlaceholder();
}

function renderDossierPlaceholder() {
  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="placeholder">
      <h2>Dossier</h2>
      <p>Person profiles and the node map land here next. Your vault currently holds
      <strong>${data.dossier.length}</strong> ${data.dossier.length === 1 ? 'profile' : 'profiles'}.</p>
    </div>`;
}

// ---------- Ledger view ----------

function entryRow(e) {
  const sign = e.type === 'income' ? '+' : '−';
  const cls = e.type === 'income' ? '' : 'expense';
  return `
    <div class="entry-row">
      <div class="entry-main">
        <div class="entry-desc">${escapeHtml(e.description)}</div>
        <div class="entry-meta">${escapeHtml(e.category)} · ${e.date}${e.time ? ' · ' + e.time : ''}</div>
      </div>
      <div class="entry-amount mono ${cls}">${sign}£${e.amount.toFixed(2)}</div>
      <button class="entry-delete" data-id="${e.id}" aria-label="Delete entry">×</button>
    </div>`;
}

function renderLedgerView() {
  const view = document.getElementById('view');
  const ym = state.currentMonth;
  const entries = entriesForMonth(data, ym);
  const totals = categoryTotals(data, ym);
  const monthly = monthlyIncomeExpense(data);

  const monthIncome = entries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const monthExpense = entries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  const net = monthIncome - monthExpense;

  view.innerHTML = `
    <div class="ledger">
      <input type="text" id="ledger-search-input" class="search-input" placeholder="Search all entries by category or description…" />
      <div id="ledger-search-results"></div>

      <div id="ledger-month-view">
        <div class="month-nav">
          <button class="nav-btn" id="prev-month" aria-label="Previous month">‹</button>
          <div class="month-label">${formatMonthLabel(ym)}</div>
          <button class="nav-btn" id="next-month" aria-label="Next month">›</button>
        </div>

        <div class="month-summary">
          <div><span class="mono">£${monthIncome.toFixed(2)}</span><label>income</label></div>
          <div><span class="mono expense">£${monthExpense.toFixed(2)}</span><label>expense</label></div>
          <div><span class="mono ${net < 0 ? 'expense' : ''}">£${net.toFixed(2)}</span><label>net</label></div>
        </div>

        <button class="add-btn" id="add-entry-btn">+ Add entry</button>
        <div id="entry-form-holder"></div>

        <div class="entry-list">
          ${entries.length ? entries.map(entryRow).join('') : '<p class="empty-note">No entries this month yet.</p>'}
        </div>

        <div class="charts-grid">
          <div class="chart-card">
            <h3>Spending by category</h3>
            ${Object.keys(totals).length ? '<canvas id="pie-canvas" height="220"></canvas>' : '<p class="empty-note">No expenses logged this month.</p>'}
          </div>
          <div class="chart-card">
            <h3>Income vs. expense</h3>
            ${monthly.length ? '<canvas id="line-canvas" height="220"></canvas>' : '<p class="empty-note">Not enough data yet.</p>'}
          </div>
        </div>
      </div>
    </div>
  `;

  try {
    if (Object.keys(totals).length) renderPieChart(document.getElementById('pie-canvas'), totals);
    if (monthly.length) renderLineChart(document.getElementById('line-canvas'), monthly);
  } catch (err) {
    console.error('Nosco: chart rendering failed, continuing without charts.', err);
  }

  document.getElementById('prev-month').onclick = () => { state.currentMonth = shiftMonth(ym, -1); renderLedgerView(); };
  document.getElementById('next-month').onclick = () => { state.currentMonth = shiftMonth(ym, 1); renderLedgerView(); };
  document.getElementById('add-entry-btn').onclick = () => showEntryForm();

  view.querySelectorAll('.entry-delete').forEach((btn) => {
    btn.onclick = async () => { deleteEntry(data, btn.dataset.id); await saveVault(); renderLedgerView(); };
  });

  const searchInput = document.getElementById('ledger-search-input');
  searchInput.oninput = () => {
    const q = searchInput.value;
    const resultsEl = document.getElementById('ledger-search-results');
    const monthViewEl = document.getElementById('ledger-month-view');
    if (!q.trim()) { resultsEl.innerHTML = ''; monthViewEl.style.display = ''; return; }
    monthViewEl.style.display = 'none';
    const results = searchEntries(data, q);
    resultsEl.innerHTML = results.length
      ? `<div class="entry-list">${results.map(entryRow).join('')}</div>`
      : '<p class="empty-note">No matches.</p>';
    resultsEl.querySelectorAll('.entry-delete').forEach((btn) => {
      btn.onclick = async () => { deleteEntry(data, btn.dataset.id); await saveVault(); searchInput.dispatchEvent(new Event('input')); };
    });
  };
}

function showEntryForm() {
  const cats = allCategories(data);
  const holder = document.getElementById('entry-form-holder');
  holder.innerHTML = `
    <form id="entry-form" class="entry-form">
      <div class="type-toggle">
        <button type="button" class="type-btn active" data-type="expense">Expense</button>
        <button type="button" class="type-btn" data-type="income">Income</button>
      </div>
      <input type="hidden" id="entry-type" value="expense" />
      <div class="form-row">
        <input type="text" id="entry-desc" placeholder="Product or service" required />
        <input type="number" id="entry-amount" placeholder="Amount" step="0.01" min="0" required />
      </div>
      <div class="form-row">
        <input type="text" id="entry-category" list="category-list" placeholder="Category" required />
        <datalist id="category-list">${cats.map((c) => `<option value="${escapeHtml(c)}">`).join('')}</datalist>
        <input type="date" id="entry-date" value="${new Date().toISOString().slice(0, 10)}" required />
        <input type="time" id="entry-time" />
      </div>
      <div class="form-actions">
        <button type="button" class="cancel-btn" id="cancel-entry">Cancel</button>
        <button type="submit" class="save-btn">Save entry</button>
      </div>
    </form>
  `;

  document.querySelectorAll('.type-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.type-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('entry-type').value = btn.dataset.type;
    };
  });

  document.getElementById('cancel-entry').onclick = () => { holder.innerHTML = ''; };

  document.getElementById('entry-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const entry = {
      id: crypto.randomUUID(),
      type: document.getElementById('entry-type').value,
      description: document.getElementById('entry-desc').value.trim(),
      amount: parseFloat(document.getElementById('entry-amount').value),
      category: document.getElementById('entry-category').value.trim(),
      date: document.getElementById('entry-date').value,
      time: document.getElementById('entry-time').value,
    };
    addEntry(data, entry);
    await saveVault();
    state.currentMonth = monthKey(entry.date);
    renderLedgerView();
  });
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
