// ledger.js — pure functions over the ledger data. No UI code here, just logic:
// grouping entries by month, totalling categories, and searching.

export function monthKey(dateStr) {
  return dateStr.slice(0, 7); // 'YYYY-MM'
}

export function addEntry(data, entry) {
  data.ledger.push(entry);
}

export function deleteEntry(data, id) {
  data.ledger = data.ledger.filter((e) => e.id !== id);
}

export function entriesForMonth(data, ym) {
  return data.ledger
    .filter((e) => monthKey(e.date) === ym)
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
}

export function categoryTotals(data, ym) {
  const totals = {};
  entriesForMonth(data, ym)
    .filter((e) => e.type === 'expense')
    .forEach((e) => { totals[e.category] = (totals[e.category] || 0) + e.amount; });
  return totals;
}

/** Income and expense totals per month, across all months that have any data — feeds the line chart. */
export function monthlyIncomeExpense(data) {
  const map = {};
  data.ledger.forEach((e) => {
    const ym = monthKey(e.date);
    if (!map[ym]) map[ym] = { income: 0, expense: 0 };
    map[ym][e.type] += e.amount;
  });
  return Object.keys(map).sort().map((ym) => ({ ym, ...map[ym] }));
}

export function searchEntries(data, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return data.ledger
    .filter((e) => e.category.toLowerCase().includes(q) || e.description.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function allCategories(data) {
  return [...new Set(data.ledger.map((e) => e.category))].sort();
}

export function formatMonthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
