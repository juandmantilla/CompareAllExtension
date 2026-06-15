/**
 * popup.js — Main popup logic for CompareAll Extension
 */

import * as DB from '../lib/db.js';

const STORE_META = {
  falabella: { name: 'Falabella', color: '#4A90D9', emoji: '🔵' },
  alkosto:   { name: 'Alkosto',   color: '#E84040', emoji: '🔴' },
  exito:     { name: 'Éxito',     color: '#F5A623', emoji: '🟠' },
  mercadolibre: { name: 'MercadoLibre', color: '#FFF159', emoji: '🟡' }
};

let activeProfileId = null;
let currentProducts = [];
let priceChart = null;
let activeHistoryProductId = null;
let activeDays = 30;
let currentPageData = null; // Data captured from active tab

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const { theme } = await chrome.storage.local.get({ theme: 'dark' });
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  await initProfileSelector();
  await renderProductList();
  await detectCurrentPage();
  initTabs();
  initEventListeners();
});

async function initProfileSelector() {
  const profiles = await DB.getProfiles();
  const { activeProfileId: savedId } = await chrome.storage.local.get({ activeProfileId: null });

  const select = document.getElementById('profile-select');
  select.innerHTML = profiles.map(p =>
    `<option value="${p.id}" ${p.id === savedId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
  ).join('');

  activeProfileId = savedId || profiles[0]?.id;
  if (!savedId && profiles[0]) {
    await chrome.storage.local.set({ activeProfileId: profiles[0].id });
  }

  select.addEventListener('change', async () => {
    activeProfileId = parseInt(select.value);
    await chrome.storage.local.set({ activeProfileId });
    await renderProductList();
  });
}

// ─────────────────────────────────────────────
//  PRODUCT LIST RENDERING
// ─────────────────────────────────────────────

async function renderProductList() {
  if (!activeProfileId) return;
  const products = await DB.getProductsByProfile(activeProfileId);
  currentProducts = products;

  const list = document.getElementById('product-list');
  const empty = document.getElementById('empty-state');
  const countEl = document.getElementById('product-count');

  countEl.textContent = products.length ? `${products.length} producto${products.length !== 1 ? 's' : ''}` : '';

  if (!products.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const cards = await Promise.all(products.map(buildProductCard));
  list.innerHTML = cards.join('');

  // Bind events on the rendered cards
  list.querySelectorAll('.btn-history').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const productId = parseInt(btn.closest('.product-card').dataset.productId);
      showHistory(productId);
    });
  });

  list.querySelectorAll('.btn-delete-card').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const productId = parseInt(btn.closest('.product-card').dataset.productId);
      if (confirm('¿Eliminar este producto del seguimiento?')) {
        await DB.deleteProduct(productId);
        await renderProductList();
        showToast('Producto eliminado');
      }
    });
  });
}

async function buildProductCard(product) {
  const pricesByStore = await DB.getLatestPriceByStore(product.id);
  const best = await DB.getBestPrice(product.id);

  const stores = Object.keys(pricesByStore);
  const hasData = stores.length > 0;

  const thumb = product.image
    ? `<img src="${escapeHtml(product.image)}" alt="" class="product-thumb" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="product-thumb-placeholder">📦</div>`;

  const bestBadge = best
    ? `<div class="best-price-badge">
         <span class="store-dot" style="background:${STORE_META[best.store]?.color}"></span>
         ${STORE_META[best.store]?.name} — ${formatCOP(best.price)}
       </div>`
    : `<div class="searching-chip">⏳ Buscando precios…</div>`;

  const storePrices = stores.map(store => {
    const price = pricesByStore[store];
    const isBest = best?.store === store;
    return `<span class="store-price-chip ${isBest ? 'best' : ''}">
      <span class="dot" style="background:${STORE_META[store]?.color}"></span>
      ${STORE_META[store]?.name}: ${formatCOP(price)}
    </span>`;
  }).join('');

  // Searching status chips for stores not yet resolved
  const searchingChips = Object.entries(product.storeStatuses || {})
    .filter(([, status]) => status === 'searching' || status === 'manual_required')
    .map(([store, status]) => {
      const label = status === 'searching' ? '⏳ Buscando' : '⚠️ Manual';
      return `<span class="searching-chip">${STORE_META[store]?.name}: ${label}</span>`;
    }).join('');

  return `
    <li class="product-card" data-product-id="${product.id}">
      <div class="card-top">
        ${thumb}
        <div class="card-info">
          <div class="card-name">${escapeHtml(product.name)}</div>
          ${bestBadge}
        </div>
      </div>
      ${hasData ? `<div class="card-prices">${storePrices}${searchingChips}</div>` : ''}
      <div class="card-actions">
        <button class="btn-history">📈 Ver historial</button>
        <button class="btn-delete-card" title="Eliminar">🗑</button>
      </div>
    </li>`;
}

// ─────────────────────────────────────────────
//  HISTORY TAB
// ─────────────────────────────────────────────

async function showHistory(productId) {
  activeHistoryProductId = productId;
  const product = currentProducts.find(p => p.id === productId);
  if (!product) return;

  switchTab('history');
  document.getElementById('history-empty').classList.add('hidden');
  document.getElementById('history-panel').classList.remove('hidden');
  document.getElementById('history-product-name').textContent = product.name;

  await renderChart(productId, activeDays);
}

async function renderChart(productId, days) {
  const product = await DB.getProduct(productId);
  const stores = Object.keys(product?.storeUrls || {});

  const datasets = [];
  const allTimestamps = new Set();

  for (const store of stores) {
    const history = await DB.getHistory(productId, store, days);
    history.forEach(h => allTimestamps.add(h.timestamp));
    datasets.push({ store, history });
  }

  const sortedTimestamps = [...allTimestamps].sort();
  const labels = sortedTimestamps.map(ts => formatDate(ts, days));

  const chartDatasets = datasets.map(({ store, history }) => {
    const priceMap = Object.fromEntries(history.map(h => [h.timestamp, h.price]));
    const data = sortedTimestamps.map(ts => priceMap[ts] || null);
    const color = STORE_META[store]?.color || '#888';

    return {
      label: STORE_META[store]?.name || store,
      data,
      borderColor: color,
      backgroundColor: hexToRgba(color, 0.08),
      pointBackgroundColor: color,
      pointRadius: data.length < 30 ? 4 : 2,
      pointHoverRadius: 6,
      borderWidth: 2,
      tension: 0.4,
      fill: true,
      spanGaps: true
    };
  });

  const ctx = document.getElementById('price-chart').getContext('2d');
  if (priceChart) priceChart.destroy();

  priceChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: chartDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#8b8fa8', font: { family: 'Inter', size: 11 }, boxWidth: 12 }
        },
        tooltip: {
          backgroundColor: '#1e2133',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#f0f1f5',
          bodyColor: '#8b8fa8',
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${formatCOP(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#4a4e6a', font: { size: 10 }, maxTicksLimit: 6 }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#4a4e6a',
            font: { size: 10 },
            callback: (v) => `$${(v / 1000).toFixed(0)}k`
          }
        }
      }
    }
  });

  // Make canvas height fixed
  document.getElementById('price-chart').style.height = '180px';

  // Render stats
  renderPriceStats(datasets);
}

function renderPriceStats(datasets) {
  const statsEl = document.getElementById('price-stats');
  if (!datasets.length) { statsEl.innerHTML = ''; return; }

  statsEl.innerHTML = datasets.map(({ store, history }) => {
    if (!history.length) return '';
    const prices = history.map(h => h.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    const color = STORE_META[store]?.color || '#888';

    return `<div class="stat-card">
      <div class="stat-store">
        <span class="stat-dot" style="background:${color}"></span>
        ${STORE_META[store]?.name}
      </div>
      <div class="stat-row"><span>Mín</span><span class="stat-value" style="color:${color}">${formatCOP(min)}</span></div>
      <div class="stat-row"><span>Máx</span><span class="stat-value">${formatCOP(max)}</span></div>
      <div class="stat-row"><span>Prom</span><span class="stat-value">${formatCOP(avg)}</span></div>
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────────
//  DETECT CURRENT PAGE (Add Tab)
// ─────────────────────────────────────────────

async function detectCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;

    const url = tab.url;
    const isTracked = isStoreProductPage(url);
    if (!isTracked) return;

    // Ask content script for current page data
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_DATA' }).catch(() => null);
    if (!response) return;

    currentPageData = { ...response, url };
    renderDetectedProduct(currentPageData);
  } catch (_) { /* not a store page */ }
}

function isStoreProductPage(url) {
  return /falabella\.com\.co\/falabella-co\/(product|p)\//.test(url) ||
         /alkosto\.com\/.*\/p(\/|\?|$)/.test(url) ||
         /exito\.com\/[^/]+-\d+\/p(\?|#|$)/.test(url) ||
         /exito\.com\/.*\/p(\/|\?|$)/.test(url) ||
         /articulo\.mercadolibre\.com\.co\//.test(url) ||
         /mercadolibre\.com\.co\/[^/]+\/p\/MCO\d+/.test(url);
}

function renderDetectedProduct(data) {
  const card = document.getElementById('current-page-product');
  if (!data?.name || !data?.price) return;

  document.getElementById('detected-name').textContent = data.name;
  document.getElementById('detected-price').textContent = formatCOP(data.price);
  document.getElementById('detected-store').textContent = STORE_META[data.store]?.name || data.store;
  document.getElementById('detected-store').style.background =
    hexToRgba(STORE_META[data.store]?.color || '#888', 0.15);
  document.getElementById('detected-store').style.color =
    STORE_META[data.store]?.color || '#888';

  if (data.image) {
    document.getElementById('detected-image').src = data.image;
  }

  card.classList.remove('hidden');
}

// ─────────────────────────────────────────────
//  EVENT LISTENERS
// ─────────────────────────────────────────────

function initEventListeners() {
  // Refresh button
  document.getElementById('btn-refresh').addEventListener('click', async () => {
    const icon = document.querySelector('#btn-refresh svg');
    icon.classList.add('spinning');
    await chrome.runtime.sendMessage({ action: 'REFRESH_NOW' });
    setTimeout(async () => {
      icon.classList.remove('spinning');
      await renderProductList();
      showToast('Precios actualizados');
    }, 2000);
  });

  // Options button
  document.getElementById('btn-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Back button in history
  document.getElementById('history-back').addEventListener('click', () => {
    switchTab('prices');
    document.getElementById('history-panel').classList.add('hidden');
    document.getElementById('history-empty').classList.remove('hidden');
    if (priceChart) { priceChart.destroy(); priceChart = null; }
  });

  // Range buttons in history
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeDays = parseInt(btn.dataset.days);
      if (activeHistoryProductId) {
        await renderChart(activeHistoryProductId, activeDays);
      }
    });
  });

  // Add detected product
  document.getElementById('btn-add-detected').addEventListener('click', async () => {
    if (!currentPageData || !activeProfileId) return;
    const btn = document.getElementById('btn-add-detected');
    btn.textContent = 'Agregando…';
    btn.disabled = true;

    try {
      await DB.addProduct({
        name: currentPageData.name,
        image: currentPageData.image,
        sku: currentPageData.sku,
        profileId: activeProfileId,
        storeUrls: { [currentPageData.store]: currentPageData.url },
        storeStatuses: { [currentPageData.store]: 'found' }
      });
      showToast('✅ Producto agregado al seguimiento');
      await renderProductList();
      switchTab('prices');
    } catch (err) {
      showToast('Error al agregar el producto');
      btn.textContent = 'Agregar a mi lista';
      btn.disabled = false;
    }
  });

  // Manual URL add
  document.getElementById('btn-add-manual').addEventListener('click', handleManualAdd);
  document.getElementById('manual-url').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleManualAdd();
  });
}

async function handleManualAdd() {
  const input = document.getElementById('manual-url');
  const status = document.getElementById('manual-status');
  const url = input.value.trim();

  if (!url) return;
  status.textContent = '🔍 Buscando producto…';

  // Detect store from URL
  let store = null;
  if (/falabella\.com\.co/.test(url)) store = 'falabella';
  else if (/alkosto\.com/.test(url)) store = 'alkosto';
  else if (/exito\.com/.test(url)) store = 'exito';
  else if (/mercadolibre\.com\.co/.test(url)) store = 'mercadolibre';

  if (!store) {
    status.textContent = '❌ URL no reconocida. Use Falabella, Alkosto, Éxito o MercadoLibre.';
    return;
  }

  try {
    // Open the URL in a background tab so content script captures it
    await chrome.tabs.create({ url, active: false });
    status.textContent = '✅ La página se abrirá para capturar el precio. Revisa tus productos en un momento.';
    input.value = '';
    setTimeout(async () => {
      await renderProductList();
      switchTab('prices');
    }, 3000);
  } catch (err) {
    status.textContent = '❌ Error al abrir la URL.';
  }
}

// ─────────────────────────────────────────────
//  TABS
// ─────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${name}`));
}

// ─────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────

function formatCOP(price) {
  if (!price) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(price);
}

function formatDate(ts, days) {
  const d = new Date(ts);
  if (days <= 7) return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' });
  if (days <= 90) return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  return d.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 2500);
}
