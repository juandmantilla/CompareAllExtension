/**
 * db.js — IndexedDB abstraction layer for CompareAll Extension
 * Database: compareall_db v1
 * Object stores: profiles, products, price_history
 */

const DB_NAME = 'compareall_db';
const DB_VERSION = 1;
const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // --- profiles ---
      if (!db.objectStoreNames.contains('profiles')) {
        const profileStore = db.createObjectStore('profiles', { keyPath: 'id', autoIncrement: true });
        profileStore.createIndex('name', 'name', { unique: false });
      }

      // --- products ---
      if (!db.objectStoreNames.contains('products')) {
        const productStore = db.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
        productStore.createIndex('profileId', 'profileId', { unique: false });
        productStore.createIndex('sku', 'sku', { unique: false });
      }

      // --- price_history ---
      if (!db.objectStoreNames.contains('price_history')) {
        const histStore = db.createObjectStore('price_history', { keyPath: 'id', autoIncrement: true });
        histStore.createIndex('productId', 'productId', { unique: false });
        histStore.createIndex('store', 'store', { unique: false });
        histStore.createIndex('productId_store', ['productId', 'store'], { unique: false });
        histStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return _db.transaction(storeName, mode).objectStore(storeName);
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─────────────────────────────────────────────
//  PROFILES
// ─────────────────────────────────────────────

export async function createProfile(name, alertThreshold = 10) {
  await openDB();
  const profile = { name, alertThreshold, productIds: [], createdAt: Date.now() };
  const id = await promisify(tx('profiles', 'readwrite').add(profile));
  return { ...profile, id };
}

export async function getProfiles() {
  await openDB();
  return promisify(tx('profiles').getAll());
}

export async function updateProfile(profile) {
  await openDB();
  return promisify(tx('profiles', 'readwrite').put(profile));
}

export async function deleteProfile(profileId) {
  await openDB();
  await promisify(tx('profiles', 'readwrite').delete(profileId));
  // Remove products belonging to this profile
  const products = await getProductsByProfile(profileId);
  for (const p of products) {
    await deleteProduct(p.id);
  }
}

// ─────────────────────────────────────────────
//  PRODUCTS
// ─────────────────────────────────────────────

export async function addProduct(data) {
  await openDB();
  const product = {
    name: data.name,
    image: data.image || '',
    profileId: data.profileId,
    storeUrls: data.storeUrls || {},      // { falabella: url, alkosto: url, exito: url }
    storeStatuses: data.storeStatuses || {}, // { alkosto: 'searching'|'found'|'manual'|'not_found' }
    sku: data.sku || '',
    addedAt: Date.now()
  };
  const id = await promisify(tx('products', 'readwrite').add(product));

  // Add product ID to profile's productIds list
  const profile = await promisify(tx('profiles').get(data.profileId));
  if (profile) {
    profile.productIds = [...(profile.productIds || []), id];
    await promisify(tx('profiles', 'readwrite').put(profile));
  }

  return { ...product, id };
}

export async function getProduct(id) {
  await openDB();
  return promisify(tx('products').get(id));
}

export async function getProductsByProfile(profileId) {
  await openDB();
  return promisify(tx('products').index('profileId').getAll(profileId));
}

export async function getAllProducts() {
  await openDB();
  return promisify(tx('products').getAll());
}

export async function updateProduct(product) {
  await openDB();
  return promisify(tx('products', 'readwrite').put(product));
}

export async function deleteProduct(productId) {
  await openDB();
  await promisify(tx('products', 'readwrite').delete(productId));
  // Clean up price history
  const history = await getHistory(productId);
  const store = tx('price_history', 'readwrite');
  for (const entry of history) {
    store.delete(entry.id);
  }
}

// ─────────────────────────────────────────────
//  PRICE HISTORY
// ─────────────────────────────────────────────

export async function savePrice(productId, storeName, price) {
  await openDB();
  const entry = { productId, store: storeName, price, timestamp: Date.now() };
  const id = await promisify(tx('price_history', 'readwrite').add(entry));
  await purgOldEntries();
  return { ...entry, id };
}

export async function getHistory(productId, storeName = null, days = 730) {
  await openDB();
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  let entries;
  if (storeName) {
    entries = await promisify(
      tx('price_history').index('productId_store').getAll([productId, storeName])
    );
  } else {
    entries = await promisify(
      tx('price_history').index('productId').getAll(productId)
    );
  }
  return entries
    .filter(e => e.timestamp >= since)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export async function getBestPrice(productId) {
  await openDB();
  const product = await getProduct(productId);
  if (!product) return null;

  const stores = Object.keys(product.storeUrls || {});
  let best = null;

  for (const storeName of stores) {
    const history = await getHistory(productId, storeName, 2); // last 2 days
    if (!history.length) continue;
    const latest = history[history.length - 1];
    if (!best || latest.price < best.price) {
      best = { store: storeName, price: latest.price, timestamp: latest.timestamp };
    }
  }
  return best;
}

export async function getLatestPriceByStore(productId) {
  await openDB();
  const product = await getProduct(productId);
  if (!product) return {};

  const stores = Object.keys(product.storeUrls || {});
  const result = {};

  for (const storeName of stores) {
    const history = await getHistory(productId, storeName, 7);
    if (history.length) {
      result[storeName] = history[history.length - 1].price;
    }
  }
  return result;
}

async function purgOldEntries() {
  const cutoff = Date.now() - TWO_YEARS_MS;
  const all = await promisify(tx('price_history').index('timestamp').getAll());
  const store = tx('price_history', 'readwrite');
  for (const entry of all) {
    if (entry.timestamp < cutoff) store.delete(entry.id);
  }
}

// ─────────────────────────────────────────────
//  BOOTSTRAP (first install)
// ─────────────────────────────────────────────

export async function ensureDefaultProfile() {
  await openDB();
  const profiles = await getProfiles();
  if (!profiles.length) {
    return createProfile('Mi Lista', 10);
  }
  return profiles[0];
}

export async function exportData() {
  await openDB();
  return {
    profiles: await promisify(tx('profiles').getAll()),
    products: await promisify(tx('products').getAll()),
    price_history: await promisify(tx('price_history').getAll()),
    exportedAt: new Date().toISOString()
  };
}

export async function importData(data) {
  await openDB();
  if (data.profiles) {
    const s = tx('profiles', 'readwrite');
    for (const p of data.profiles) s.put(p);
  }
  if (data.products) {
    const s = tx('products', 'readwrite');
    for (const p of data.products) s.put(p);
  }
  if (data.price_history) {
    const s = tx('price_history', 'readwrite');
    for (const h of data.price_history) s.put(h);
  }
}
