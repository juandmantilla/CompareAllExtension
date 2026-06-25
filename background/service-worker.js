/**
 * service-worker.js — Background Service Worker for CompareAll (MV3)
 * Handles: message routing, periodic price updates, cross-store search, notifications.
 */

import * as DB from '../lib/db.js';
import { searchAllStores, parseCOPPrice } from '../lib/search.js';

const ALARM_NAME = 'price-refresh';
const DEFAULT_INTERVAL_HOURS = 6;

// ─────────────────────────────────────────────
//  INSTALL / STARTUP
// ─────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    // Create default profile on first install
    await DB.ensureDefaultProfile();
    // Open options page on first install to welcome user
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
  }
  await scheduleAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await scheduleAlarm();
});

async function scheduleAlarm() {
  const { refreshInterval } = await chrome.storage.local.get({ refreshInterval: DEFAULT_INTERVAL_HOURS });
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: refreshInterval * 60
  });
}

// ─────────────────────────────────────────────
//  ALARM — Periodic price refresh
// ─────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await refreshAllPrices();
});

async function refreshAllPrices() {
  const products = await DB.getAllProducts();
  for (const product of products) {
    for (const [store, url] of Object.entries(product.storeUrls || {})) {
      if (!url) continue;
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; CompareAll/1.0)',
            'Accept': 'text/html,application/xhtml+xml'
          },
          signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) continue;
        
        const html = await response.text();
        const price = extractPriceFromHtml(html, store);
        
        if (price) {
          await DB.savePrice(product.id, store, price);
          await checkPriceAlert(product.id, store, price);
        }
      } catch (err) {
        console.warn(`[CompareAll SW] Could not refresh ${store} for product ${product.id}:`, err);
      }
    }
  }
}

function extractPriceFromHtml(html, store) {
  // Strategy 1: OpenGraph Meta Tag
  const ogMatch = html.match(/<meta[^>]*property="product:price:amount"[^>]*content="([^"]+)"/i) ||
                  html.match(/<meta[^>]*content="([^"]+)"[^>]*property="product:price:amount"/i);
  if (ogMatch) {
    const price = parseCOPPrice(ogMatch[1]);
    if (price) return price;
  }

  // Strategy 2: JSON-LD schema
  const jsonLdMatches = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item.offers && item.offers.price) {
          const price = parseCOPPrice(String(item.offers.price));
          if (price) return price;
        }
      }
    } catch(e) {}
  }

  // Strategy 3: Specific store regex fallbacks
  if (store === 'falabella') {
    const pMatch = html.match(/data-internet-price="(\d+)"/i);
    if (pMatch) return parseInt(pMatch[1], 10);
  }
  if (store === 'alkosto') {
    const pMatch = html.match(/class="price__offer--price"[^>]*>[^<]*?([\d.,]+)/i);
    if (pMatch) return parseCOPPrice(pMatch[1]);
  }
  if (store === 'mercadolibre') {
    const pMatch = html.match(/class="andes-money-amount__fraction"[^>]*>([\d.,]+)/i);
    if (pMatch) return parseCOPPrice(pMatch[1]);
  }
  
  return null;
}

// ─────────────────────────────────────────────
//  MESSAGES from content scripts & popup
// ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((err) => {
    console.error('[CompareAll SW] Message handler error:', err);
    sendResponse({ success: false, error: err.message });
  });
  return true; // Keep message channel open for async response
});

async function handleMessage(message, sender) {
  switch (message.action) {

    case 'PRICE_CAPTURED': {
      const { store, name, price, image, sku, url } = message;
      if (!price || price < 1000) return { success: false, reason: 'invalid_price' };

      // Check if product already exists by URL
      const allProducts = await DB.getAllProducts();
      const existing = allProducts.find(p =>
        Object.values(p.storeUrls || {}).includes(url)
      );
      let productId = existing?.id;

      if (!productId) {
        // New product — get active profile
        const { activeProfileId } = await chrome.storage.local.get({ activeProfileId: null });
        const profiles = await DB.getProfiles();
        const profileId = activeProfileId || profiles[0]?.id;
        if (!profileId) return { success: false, reason: 'no_profile' };

        // Add new product
        const product = await DB.addProduct({
          name, image, sku, profileId,
          storeUrls: { [store]: url },
          storeStatuses: { [store]: 'found' }
        });
        productId = product.id;

        // Trigger cross-store search asynchronously
        triggerCrossStoreSearch(productId, name, store);
      }

      // Save price
      await DB.savePrice(productId, store, price);

      // Check alert threshold
      await checkPriceAlert(productId, store, price);

      return { success: true, productId };
    }

    case 'SEARCH_CROSS_STORE': {
      const { productId, productName, sourceStore } = message;
      await triggerCrossStoreSearch(productId, productName, sourceStore);
      return { success: true };
    }

    case 'UPDATE_ALARM_INTERVAL': {
      await chrome.storage.local.set({ refreshInterval: message.hours });
      await scheduleAlarm();
      return { success: true };
    }

    case 'REFRESH_NOW': {
      await refreshAllPrices();
      return { success: true };
    }

    case 'CHECK_TRACKED': {
      const { url } = message;
      if (!url) return { tracked: false };
      const allProducts = await DB.getAllProducts();
      const isTracked = allProducts.some(p =>
        Object.values(p.storeUrls || {}).some(storeUrl =>
          storeUrl && url.includes(storeUrl.split('?')[0].split('#')[0]) ||
          storeUrl && storeUrl.includes(url.split('?')[0].split('#')[0])
        )
      );
      return { tracked: isTracked };
    }

    default:
      return { success: false, reason: 'unknown_action' };
  }
}

// ─────────────────────────────────────────────
//  Cross-Store Auto Search
// ─────────────────────────────────────────────

async function triggerCrossStoreSearch(productId, productName, sourceStore) {
  try {
    const results = await searchAllStores(productName, sourceStore);
    const product = await DB.getProduct(productId);
    if (!product) return;

    const updatedUrls = { ...product.storeUrls };
    const updatedStatuses = { ...product.storeStatuses };

    let needsManualReview = false;

    for (const [store, result] of Object.entries(results)) {
      if (result.status === 'found') {
        updatedUrls[store] = result.url;
        updatedStatuses[store] = 'found';
        // Save initial price if available
        if (result.price) {
          await DB.savePrice(productId, store, result.price);
        }
      } else if (result.status === 'manual_required') {
        updatedStatuses[store] = 'manual_required';
        needsManualReview = true;
      } else {
        updatedStatuses[store] = result.status || 'not_found';
      }
    }

    await DB.updateProduct({ ...product, storeUrls: updatedUrls, storeStatuses: updatedStatuses });

    if (needsManualReview) {
      chrome.notifications.create(`manual_review_${productId}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title: 'CompareAll — Revisión Manual Requerida',
        message: `No se pudo encontrar automáticamente "${productName}" en algunas tiendas. Puedes vincularlo manualmente en Opciones.`,
        priority: 1
      });
    }
  } catch (err) {
    console.error('[CompareAll SW] Cross-store search error:', err);
  }
}

// ─────────────────────────────────────────────
//  Price Alert Notifications
// ─────────────────────────────────────────────

async function checkPriceAlert(productId, store, currentPrice) {
  try {
    const product = await DB.getProduct(productId);
    if (!product) return;

    const profiles = await DB.getProfiles();
    const profile = profiles.find(p => p.id === product.profileId);
    if (!profile?.alertThreshold) return;

    // Get price from 7 days ago
    const history = await DB.getHistory(productId, store, 8);
    if (history.length < 2) return;

    const oldPrice = history[0].price;
    const dropPercent = ((oldPrice - currentPrice) / oldPrice) * 100;

    if (dropPercent >= profile.alertThreshold) {
      const storeNames = { falabella: 'Falabella', alkosto: 'Alkosto', exito: 'Éxito', mercadolibre: 'MercadoLibre' };
      chrome.notifications.create(`price_drop_${productId}_${store}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title: `🔥 CompareAll — Precio bajó ${dropPercent.toFixed(0)}%`,
        message: `${product.name}\n${storeNames[store]}: $${currentPrice.toLocaleString('es-CO')} (antes $${oldPrice.toLocaleString('es-CO')})`,
        priority: 2
      });
    }
  } catch (err) {
    console.warn('[CompareAll SW] Alert check error:', err);
  }
}
