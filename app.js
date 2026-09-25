// app.js — entry point. Handles first-run password setup, the unlock flow,
// navigation, the Ledger view, and the Dossier + node map view.

import { generateSalt, deriveKey, encryptData, decryptData, saltToBase64, saltFromBase64 } from './crypto.js';
import { getSaltRecord, setSaltRecord, getVault, setVault, hasExistingVault } from './storage.js';
import {
  addEntry, deleteEntry, entriesForMonth, categoryTotals, monthlyIncomeExpense,
  searchEntries, allCategories, formatMonthLabel, currentMonthKey, shiftMonth, monthKey,
} from './ledger.js';
import { renderPieChart, renderLineChart } from './charts.js';
import {
  addPerson, updatePerson, deletePerson, personById, addLink, removeLink,
  connectedPeople, searchPeople,
} from './dossier.js';
import { renderNodeMap } from './nodemap.js';

const root = document.getElementById('app');

// In-memory only — never written to disk. Cleared on lock.
let sessionKey = null;
let data = null; // { ledger: [], dossier: [], links: [] }
const state = { currentMonth: currentMonthKey(), dossierView: 'list', selectedPersonId: null };

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

function splitTags(str) {
  return str.split(',').map((s) => s.trim()).filter(Boolean);
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
        data = await decryptData(key, record);
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
  else renderDossierView();
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

// ---------- Dossier view ----------

function personCard(p) {
  const tags = (p.traits || []).slice(0, 3).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  return `
    <div class="person-card" data-id="${p.id}">
      <div class="person-name">${escapeHtml(p.name)}</div>
      ${p.location ? `<div class="person-location">${escapeHtml(p.location)}</div>` : ''}
      <div class="person-tags">${tags}</div>
    </div>`;
}

function renderDossierView() {
  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="dossier">
      <input type="text" id="dossier-search-input" class="search-input" placeholder="Search people, traits, or locations…" />
      <div id="dossier-search-results"></div>

      <div id="dossier-main">
        <div class="dossier-toggle">
          <button class="view-toggle-btn ${state.dossierView === 'list' ? 'active' : ''}" data-view="list">People</button>
          <button class="view-toggle-btn ${state.dossierView === 'map' ? 'active' : ''}" data-view="map">Map</button>
        </div>
        <button class="add-btn" id="add-person-btn">+ Add person</button>
        <div id="person-form-holder"></div>
        <div id="dossier-content"></div>
      </div>
    </div>
    <div id="person-detail-holder"></div>
  `;

  document.querySelectorAll('.view-toggle-btn').forEach((btn) => {
    btn.onclick = () => { state.dossierView = btn.dataset.view; renderDossierView(); };
  });
  document.getElementById('add-person-btn').onclick = () => showPersonForm();

  renderDossierContent();
  if (state.selectedPersonId) renderPersonDetail(state.selectedPersonId);

  const searchInput = document.getElementById('dossier-search-input');
  searchInput.oninput = () => {
    const q = searchInput.value;
    const resultsEl = document.getElementById('dossier-search-results');
    const mainEl = document.getElementById('dossier-main');
    if (!q.trim()) { resultsEl.innerHTML = ''; mainEl.style.display = ''; return; }
    mainEl.style.display = 'none';
    const results = searchPeople(data, q);
    resultsEl.innerHTML = results.length
      ? `<div class="person-grid">${results.map(personCard).join('')}</div>`
      : '<p class="empty-note">No matches.</p>';
    resultsEl.querySelectorAll('.person-card').forEach((card) => {
      card.onclick = () => { state.selectedPersonId = card.dataset.id; renderPersonDetail(card.dataset.id); };
    });
  };
}

function renderDossierContent() {
  const el = document.getElementById('dossier-content');
  if (state.dossierView === 'map') {
    el.innerHTML = data.dossier.length
      ? '<div class="map-wrap"><svg id="node-map-svg"></svg></div>'
      : '<p class="empty-note">Add a couple of people to see the map.</p>';
    if (data.dossier.length) {
      try {
        const svg = document.getElementById('node-map-svg');
        const width = el.clientWidth || 600;
        renderNodeMap(svg, data, {
          width, height: 480,
          onNodeClick: (id) => { state.selectedPersonId = id; renderPersonDetail(id); },
        });
      } catch (err) {
        console.error('Nosco: node map failed to render, continuing without it.', err);
      }
    }
  } else {
    el.innerHTML = data.dossier.length
      ? `<div class="person-grid">${data.dossier.map(personCard).join('')}</div>`
      : '<p class="empty-note">No one added yet.</p>';
    el.querySelectorAll('.person-card').forEach((card) => {
      card.onclick = () => { state.selectedPersonId = card.dataset.id; renderPersonDetail(card.dataset.id); };
    });
  }
}

function showPersonForm(existing) {
  const holder = document.getElementById('person-form-holder');
  const p = existing || { name: '', location: '', traits: [], mistakes: [], notes: '' };
  holder.innerHTML = `
    <form id="person-form" class="entry-form">
      <div class="form-row">
        <input type="text" id="person-name" placeholder="Name" value="${escapeHtml(p.name)}" required />
        <input type="text" id="person-location" placeholder="Location (met, works, lives…)" value="${escapeHtml(p.location || '')}" />
      </div>
      <input type="text" id="person-traits" placeholder="Traits (comma separated)" value="${escapeHtml((p.traits || []).join(', '))}" />
      <input type="text" id="person-mistakes" placeholder="Common mistakes / habits (comma separated)" value="${escapeHtml((p.mistakes || []).join(', '))}" />
      <textarea id="person-notes" placeholder="Notes — anything worth remembering" rows="3">${escapeHtml(p.notes || '')}</textarea>
      <div class="form-actions">
        <button type="button" class="cancel-btn" id="cancel-person">Cancel</button>
        <button type="submit" class="save-btn">${existing ? 'Save changes' : 'Add person'}</button>
      </div>
    </form>
  `;

  document.getElementById('cancel-person').onclick = () => { holder.innerHTML = ''; };

  document.getElementById('person-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = {
      name: document.getElementById('person-name').value.trim(),
      location: document.getElementById('person-location').value.trim(),
      traits: splitTags(document.getElementById('person-traits').value),
      mistakes: splitTags(document.getElementById('person-mistakes').value),
      notes: document.getElementById('person-notes').value.trim(),
    };
    if (existing) {
      updatePerson(data, existing.id, values);
    } else {
      addPerson(data, { id: crypto.randomUUID(), ...values });
    }
    await saveVault();
    holder.innerHTML = '';
    renderDossierView();
  });
}

function renderPersonDetail(id) {
  const holder = document.getElementById('person-detail-holder');
  const p = personById(data, id);
  if (!p) { holder.innerHTML = ''; return; }
  const connections = connectedPeople(data, id);
  const others = data.dossier.filter((x) => x.id !== id && !connections.some((c) => c.person.id === x.id));

  holder.innerHTML = `
    <div class="detail-overlay">
      <div class="detail-panel">
        <button class="detail-close" id="detail-close" aria-label="Close">×</button>
        <h2>${escapeHtml(p.name)}</h2>
        ${p.location ? `<div class="detail-location">${escapeHtml(p.location)}</div>` : ''}

        ${(p.traits || []).length ? `<div class="detail-section"><label>Traits</label><div class="person-tags">${p.traits.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div></div>` : ''}
        ${(p.mistakes || []).length ? `<div class="detail-section"><label>Common mistakes</label><div class="person-tags">${p.mistakes.map((t) => `<span class="tag tag-warn">${escapeHtml(t)}</span>`).join('')}</div></div>` : ''}
        ${p.notes ? `<div class="detail-section"><label>Notes</label><p class="detail-notes">${escapeHtml(p.notes)}</p></div>` : ''}

        <div class="detail-section">
          <label>Connections</label>
          ${connections.length
            ? `<div class="connection-list">${connections.map((c) => `
              <div class="connection-row">
                <span>${escapeHtml(c.person.name)}</span>
                <button class="conn-remove" data-link="${c.link.id}">Remove</button>
              </div>`).join('')}</div>`
            : '<p class="empty-note">No connections yet.</p>'}
          ${others.length ? `
          <div class="connect-form">
            <select id="connect-select">${others.map((o) => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}</select>
            <button class="add-btn" id="connect-btn">Link</button>
          </div>` : ''}
        </div>

        <div class="detail-actions">
          <button class="cancel-btn" id="edit-person">Edit</button>
          <button class="delete-btn" id="delete-person">Delete person</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('detail-close').onclick = () => { state.selectedPersonId = null; holder.innerHTML = ''; };
  document.getElementById('edit-person').onclick = () => {
    state.selectedPersonId = null;
    holder.innerHTML = '';
    showPersonForm(p);
    document.getElementById('person-form-holder').scrollIntoView({ behavior: 'smooth' });
  };
  document.getElementById('delete-person').onclick = async () => {
    if (!confirm(`Delete ${p.name}? This can't be undone.`)) return;
    deletePerson(data, id);
    await saveVault();
    state.selectedPersonId = null;
    renderDossierView();
  };
  holder.querySelectorAll('.conn-remove').forEach((btn) => {
    btn.onclick = async () => { removeLink(data, btn.dataset.link); await saveVault(); renderPersonDetail(id); };
  });
  const connectBtn = document.getElementById('connect-btn');
  if (connectBtn) connectBtn.onclick = async () => {
    const otherId = document.getElementById('connect-select').value;
    addLink(data, id, otherId);
    await saveVault();
    renderPersonDetail(id);
  };
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
