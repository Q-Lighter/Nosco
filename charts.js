// charts.js — wraps Chart.js (loaded via CDN in index.html) so app.js doesn't touch chart
// config directly. Keeps chart instances module-scoped so re-renders destroy the old one first.

let pieChart = null;
let lineChart = null;

const MUTED = '#8d9093';
const GRID = '#1c1e1f';
const PALETTE = ['#b0935a', '#7c9a7e', '#8d7ab0', '#b06a5a', '#5a8fb0', '#b0a25a', '#6e5d3c', '#5a5d6e'];

export function renderPieChart(canvas, totals) {
  if (typeof Chart === 'undefined') { console.warn('Nosco: Chart.js did not load — skipping pie chart.'); return; }
  if (pieChart) { pieChart.destroy(); pieChart = null; }
  const labels = Object.keys(totals);
  if (labels.length === 0) return;
  const values = Object.values(totals);
  pieChart = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: PALETTE, borderColor: '#0c0d0e', borderWidth: 2 }] },
    options: {
      plugins: { legend: { position: 'bottom', labels: { color: MUTED, font: { family: 'Inter', size: 12 }, padding: 14 } } },
      cutout: '62%',
    },
  });
}

export function renderLineChart(canvas, monthly) {
  if (typeof Chart === 'undefined') { console.warn('Nosco: Chart.js did not load — skipping line chart.'); return; }
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (monthly.length === 0) return;
  const labels = monthly.map((m) => m.ym);
  lineChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Income', data: monthly.map((m) => m.income), borderColor: '#7c9a7e', backgroundColor: 'transparent', tension: 0.3 },
        { label: 'Expense', data: monthly.map((m) => m.expense), borderColor: '#b06a5a', backgroundColor: 'transparent', tension: 0.3 },
      ],
    },
    options: {
      scales: {
        x: { ticks: { color: MUTED, font: { family: 'IBM Plex Mono', size: 11 } }, grid: { color: GRID } },
        y: { ticks: { color: MUTED, font: { family: 'IBM Plex Mono', size: 11 } }, grid: { color: GRID } },
      },
      plugins: { legend: { labels: { color: MUTED, font: { family: 'Inter', size: 12 } } } },
    },
  });
}
