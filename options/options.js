/**
 * options.js — Options page logic for CompareAll Extension
 */

import * as DB from '../lib/db.js';

const STORE_META = {
  falabella: { name: 'Falabella', color: '#4A90D9' },
  alkosto:   { name: 'Alkosto',   color: '#E84040' },
  exito:     { name: 'Éxito',     color: '#F5A623' }
};

let allProfiles = [];
let allProducts = [];
let editingProfileId = null;

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  initSidebar();
  await loadAll();
  renderProductsSection();
  renderProfilesSection();
  loadSettings();
  initEventListeners();
});

async function loadAll() {
  allProfiles = await DB.getProfiles();
  allProducts = await DB.getAllProducts();
}

// ─────────────────────────────────────────────
//  SIDEBAR NAV
// ─────────────────────────────────────────────

function initSidebar() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById(`section-${section}`).classList.add('active');
    });
  });
}

// ─────────────────────────────────────────────
//  PRODUCTS SECTION
// ─────────────────────────────────────────────

function renderProductsSection() {
  const filterProfile = document.getElementById('filter-profile');
  const filterStore   = document.getElementById('filter-store');

  // Populate profile filter
  filterProfile.innerHTML = `<option value="">Todos los perfiles</option>` +
    allProfiles.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');

  renderProductsTable();

  filterProfile.addEventListener('change', renderProductsTable);
  filterStore.addEventListener('change', renderProductsTable);
}

async function renderProductsTable() {
  const profileFilter = document.getElementById('filter-profile').value;
  const storeFilter   = document.getElementById('filter-store').value;

  let products = allProducts;
  if (profileFilter) products = products.filter(p => p.profileId == profileFilter);
  if (storeFilter)   products = products.filter(p => p.storeUrls?.[storeFilter]);

  const empty   = document.getElementById('products-empty');
  const tableWrap = document.getElementById('products-table-wrap');

  if (!products.length) {
    empty.classList.remove('hidden');
    tableWrap.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  tableWrap.classList.remove('hidden');

  const rows = await Promise.all(products.map(buildProductRow));
  document.getElementById('products-tbody').innerHTML = rows.join('');

  // Bind events
  document.querySelectorAll('.btn-edit-product').forEach(btn => {
    btn.addEventListener('click', () => openProductModal(parseInt(btn.dataset.id)));
  });
  document.querySelectorAll('.btn-delete-product').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('¿Eliminar este producto y su historial?')) {
        await DB.deleteProduct(parseInt(btn.dataset.id));
        await loadAll();
        renderProductsSection();
        showToast('Producto eliminado');
      }
    });
  });
}

async function buildProductRow(product) {
  const best = await DB.getBestPrice(product.id);
  const profile = allProfiles.find(p => p.id === product.profileId);

  const storeChips = Object.entries(STORE_META).map(([store, meta]) => {
    const status = product.storeStatuses?.[store];
    const hasUrl  = !!product.storeUrls?.[store];
    const searchUrl = product.storeSearchUrls?.[store];
    if (!status && !hasUrl) return '';
    const statusClass = status || (hasUrl ? 'found' : 'not_found');
    const label = store === 'exito' ? 'Éxito' : meta.name;
    if (statusClass === 'manual_required' && searchUrl) {
      return `<a href="${escapeHtml(searchUrl)}" target="_blank" class="store-chip chip-${store} manual_required" title="Buscar manualmente en ${label}" style="text-decoration:none">🔍 ${label}</a>`;
    }
    return `<span class="store-chip chip-${store} ${statusClass}">${label}</span>`;
  }).filter(Boolean).join('');

  const thumb = product.image
    ? `<img src="${escapeHtml(product.image)}" class="product-thumb-sm" alt="" onerror="this.style.display='none'">`
    : `<div class="product-thumb-sm" style="display:flex;align-items:center;justify-content:center;font-size:18px">📦</div>`;

  const firstUrl = Object.values(product.storeUrls || {}).find(u => !!u) || '#';

  return `<tr>
    <td>
      <div class="product-cell">
        ${thumb}
        <a href="${escapeHtml(firstUrl)}" target="_blank" style="text-decoration: none; color: inherit; display: flex; align-items: center; gap: 4px;">
          <span class="product-name-cell" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</span>
          ${firstUrl !== '#' ? '<span style="font-size: 10px; color: var(--text-secondary);">🔗</span>' : ''}
        </a>
      </div>
    </td>
    <td><div class="store-chips">${storeChips || '—'}</div></td>
    <td class="best-price-cell">${best ? formatCOP(best.price) + ' <span style="font-size:11px;color:#8b8fa8">(' + (STORE_META[best.store]?.name || best.store) + ')</span>' : '—'}</td>
    <td style="color:var(--text-secondary)">${escapeHtml(profile?.name || '—')}</td>
    <td>
      <div class="action-btns">
        <button class="btn-action btn-edit btn-edit-product" data-id="${product.id}">✏️ Editar</button>
        <button class="btn-action btn-del btn-delete-product" data-id="${product.id}">🗑</button>
      </div>
    </td>
  </tr>`;
}

// ─────────────────────────────────────────────
//  PROFILES SECTION
// ─────────────────────────────────────────────

async function renderProfilesSection() {
  const { activeProfileId } = await chrome.storage.local.get({ activeProfileId: null });
  const container = document.getElementById('profiles-list');

  container.innerHTML = allProfiles.map(profile => {
    const count = allProducts.filter(p => p.profileId === profile.id).length;
    const isActive = profile.id === activeProfileId;

    return `<div class="profile-card">
      ${isActive ? '<span class="active-badge">Activo</span>' : ''}
      <div class="profile-card-name">${escapeHtml(profile.name)}</div>
      <div class="profile-card-meta">
        ${count} producto${count !== 1 ? 's' : ''} •
        Alerta al ${profile.alertThreshold}% de bajada
      </div>
      <div class="profile-card-actions">
        ${!isActive ? `<button class="btn-secondary btn-set-active" data-id="${profile.id}">Activar</button>` : ''}
        <button class="btn-secondary btn-edit-profile" data-id="${profile.id}">Editar</button>
        ${allProfiles.length > 1 ? `<button class="btn-danger btn-del-profile" data-id="${profile.id}">Eliminar</button>` : ''}
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.btn-set-active').forEach(btn => {
    btn.addEventListener('click', async () => {
      await chrome.storage.local.set({ activeProfileId: parseInt(btn.dataset.id) });
      await renderProfilesSection();
      showToast('Perfil activo cambiado');
    });
  });

  container.querySelectorAll('.btn-edit-profile').forEach(btn => {
    btn.addEventListener('click', () => openProfileModal(parseInt(btn.dataset.id)));
  });

  container.querySelectorAll('.btn-del-profile').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('¿Eliminar este perfil y todos sus productos?')) {
        await DB.deleteProfile(parseInt(btn.dataset.id));
        await loadAll();
        await renderProfilesSection();
        renderProductsSection();
        showToast('Perfil eliminado');
      }
    });
  });
}

// ─────────────────────────────────────────────
//  PROFILE MODAL
// ─────────────────────────────────────────────

function openProfileModal(profileId = null) {
  editingProfileId = profileId;
  const modal = document.getElementById('modal-profile');
  const titleEl = document.getElementById('modal-profile-title');

  if (profileId) {
    const profile = allProfiles.find(p => p.id === profileId);
    titleEl.textContent = 'Editar Perfil';
    document.getElementById('profile-name-input').value = profile?.name || '';
    document.getElementById('profile-threshold-input').value = profile?.alertThreshold || 10;
  } else {
    titleEl.textContent = 'Nuevo Perfil';
    document.getElementById('profile-name-input').value = '';
    document.getElementById('profile-threshold-input').value = 10;
  }

  modal.classList.remove('hidden');
  document.getElementById('profile-name-input').focus();
}

function closeProfileModal() {
  document.getElementById('modal-profile').classList.add('hidden');
  editingProfileId = null;
}

// ─────────────────────────────────────────────
//  PRODUCT EDIT MODAL
// ─────────────────────────────────────────────

function openProductModal(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;

  document.getElementById('edit-product-id').value = productId;
  document.getElementById('edit-product-name').value = product.name || '';

  // Fill URL fields and show suggested search links for manual_required stores
  const urlFields = [
    { store: 'falabella',    id: 'edit-url-falabella' },
    { store: 'alkosto',      id: 'edit-url-alkosto' },
    { store: 'exito',        id: 'edit-url-exito' }
  ];
  for (const { store, id } of urlFields) {
    const input = document.getElementById(id);
    if (!input) continue;
    input.value = product.storeUrls?.[store] || '';
    // Find or create a hint element below the input
    let hint = document.getElementById(`hint-${id}`);
    if (!hint) {
      hint = document.createElement('div');
      hint.id = `hint-${id}`;
      hint.style.cssText = 'font-size:11px;margin-top:3px;min-height:16px';
      input.parentNode.insertBefore(hint, input.nextSibling);
    }
    const searchUrl = product.storeSearchUrls?.[store];
    const status    = product.storeStatuses?.[store];
    if (!product.storeUrls?.[store] && searchUrl && status === 'manual_required') {
      const storeName = STORE_META[store]?.name || store;
      hint.innerHTML = `<a href="${escapeHtml(searchUrl)}" target="_blank"
        style="color:#F5A623;text-decoration:none" title="Abre la búsqueda sugerida y pega la URL del producto">
        🔍 Buscar &ldquo;${escapeHtml(product.name)}&rdquo; en ${storeName} &rarr;
      </a>`;
    } else {
      hint.innerHTML = '';
    }
  }

  const profileSelect = document.getElementById('edit-product-profile');
  profileSelect.innerHTML = allProfiles.map(p =>
    `<option value="${p.id}" ${p.id === product.profileId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
  ).join('');

  document.getElementById('modal-product').classList.remove('hidden');
}

function closeProductModal() {
  document.getElementById('modal-product').classList.add('hidden');
}

// ─────────────────────────────────────────────
//  SETTINGS
// ─────────────────────────────────────────────

async function loadSettings() {
  const { refreshInterval, notificationsEnabled, autoSearchEnabled, theme } = await chrome.storage.local.get({
    refreshInterval: 6,
    notificationsEnabled: true,
    autoSearchEnabled: true,
    theme: 'dark'
  });

  // Apply theme to current page
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  document.getElementById('setting-theme').value = theme;
  document.getElementById('setting-interval').value = refreshInterval;
  document.getElementById('setting-notifications').checked = notificationsEnabled;
  document.getElementById('setting-auto-search').checked = autoSearchEnabled;
}

// ─────────────────────────────────────────────
//  EVENT LISTENERS
// ─────────────────────────────────────────────

function initEventListeners() {
  // New profile
  document.getElementById('btn-new-profile').addEventListener('click', () => openProfileModal());

  // Profile modal cancel/save
  document.getElementById('modal-profile-cancel').addEventListener('click', closeProfileModal);
  document.getElementById('modal-profile-save').addEventListener('click', async () => {
    const name = document.getElementById('profile-name-input').value.trim();
    const threshold = parseInt(document.getElementById('profile-threshold-input').value) || 10;
    if (!name) { showToast('Ingresa un nombre para el perfil'); return; }

    if (editingProfileId) {
      const profile = allProfiles.find(p => p.id === editingProfileId);
      await DB.updateProfile({ ...profile, name, alertThreshold: threshold });
    } else {
      await DB.createProfile(name, threshold);
    }
    closeProfileModal();
    await loadAll();
    await renderProfilesSection();
    showToast(editingProfileId ? 'Perfil actualizado' : 'Perfil creado');
  });

  // Product modal cancel/save
  document.getElementById('modal-product-cancel').addEventListener('click', closeProductModal);
  document.getElementById('modal-product-save').addEventListener('click', async () => {
    const id = parseInt(document.getElementById('edit-product-id').value);
    const product = allProducts.find(p => p.id === id);
    if (!product) return;

    const updatedProduct = {
      ...product,
      name: document.getElementById('edit-product-name').value.trim() || product.name,
      profileId: parseInt(document.getElementById('edit-product-profile').value),
      storeUrls: {
        falabella: document.getElementById('edit-url-falabella').value.trim() || undefined,
        alkosto:   document.getElementById('edit-url-alkosto').value.trim() || undefined,
        exito:     document.getElementById('edit-url-exito').value.trim() || undefined
      },
      storeStatuses: {
        falabella: document.getElementById('edit-url-falabella').value.trim() ? 'found' : undefined,
        alkosto:   document.getElementById('edit-url-alkosto').value.trim()   ? 'found' : undefined,
        exito:     document.getElementById('edit-url-exito').value.trim()     ? 'found' : undefined
      }
    };

    // Clean undefined
    Object.keys(updatedProduct.storeUrls).forEach(k => {
      if (!updatedProduct.storeUrls[k]) delete updatedProduct.storeUrls[k];
    });
    Object.keys(updatedProduct.storeStatuses).forEach(k => {
      if (!updatedProduct.storeStatuses[k]) delete updatedProduct.storeStatuses[k];
    });

    await DB.updateProduct(updatedProduct);
    closeProductModal();
    await loadAll();
    renderProductsSection();
    showToast('Producto actualizado');
  });

  // Settings: theme
  document.getElementById('setting-theme').addEventListener('change', async (e) => {
    const theme = e.target.value;
    await chrome.storage.local.set({ theme });
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    showToast('Apariencia guardada');
  });

  // Settings: interval
  document.getElementById('setting-interval').addEventListener('change', async (e) => {
    const hours = parseInt(e.target.value);
    await chrome.storage.local.set({ refreshInterval: hours });
    await chrome.runtime.sendMessage({ action: 'UPDATE_ALARM_INTERVAL', hours });
    showToast('Frecuencia guardada');
  });

  // Settings: notifications toggle
  document.getElementById('setting-notifications').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ notificationsEnabled: e.target.checked });
  });

  // Settings: auto-search toggle
  document.getElementById('setting-auto-search').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ autoSearchEnabled: e.target.checked });
  });

  // Settings: clear history
  document.getElementById('btn-clear-history').addEventListener('click', async () => {
    if (confirm('¿Eliminar todo el historial de precios? Los productos se conservan.')) {
      const data = await DB.exportData();
      // Re-import without history
      await DB.importData({ profiles: data.profiles, products: data.products, price_history: [] });
      showToast('Historial eliminado');
    }
  });

  // Data: export
  document.getElementById('btn-export').addEventListener('click', async () => {
    const data = await DB.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compareall-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Datos exportados');
  });

  // Data: import
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const status = document.getElementById('import-status');
    status.textContent = 'Importando…';
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await DB.importData(data);
      await loadAll();
      renderProductsSection();
      await renderProfilesSection();
      status.textContent = '✅ Datos importados correctamente.';
      showToast('Datos importados');
    } catch (err) {
      status.textContent = `❌ Error al importar: ${err.message}`;
    }
    e.target.value = '';
  });

  // Close modals on overlay click
  document.getElementById('modal-profile').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeProfileModal();
  });
  document.getElementById('modal-product').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeProductModal();
  });
}

// ─────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────

function formatCOP(price) {
  if (!price) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(price);
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
