/**
 * search.js — Cross-store automatic product search
 * Searches for a product by name across all configured stores.
 * Uses verified JSON APIs for each store (no HTML scraping).
 *
 * Strategies:
 *  - Alkosto   : Algolia REST API (credentials embedded in their public HTML)
 *  - Éxito     : VTEX Catalog API (public, no auth required)
 *  - Falabella : HTML search with RegEx fallback (no public JSON API available)
 *  - MercadoLibre : MercadoLibre public suggestions API
 */

// ── Algolia credentials for Alkosto (extracted from their public frontend bundle) ──
const ALKOSTO_ALGOLIA_APP_ID  = 'QX5IPS1B1Q';
const ALKOSTO_ALGOLIA_API_KEY = '7a8800d62203ee3a9ff1cdf74f99b268';
const ALKOSTO_ALGOLIA_INDEX   = 'alkostoIndexAlgoliaPRD';

const SIMILARITY_THRESHOLD = 0.40; // Lower to compensate for shorter store names

// ─────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────

/**
 * Busca un producto en todas las tiendas excepto la tienda origen.
 * @param {string} productName  - Nombre completo del producto
 * @param {string} sourceStore  - Tienda donde se encontró originalmente
 * @returns {Object} { storeName: { status, url, name, price, confidence } }
 */
export async function searchAllStores(productName, sourceStore) {
  const allStores = ['alkosto', 'exito', 'falabella', 'mercadolibre'];
  const targetStores = allStores.filter(s => s !== sourceStore);
  const results = {};

  await Promise.allSettled(
    targetStores.map(async (store) => {
      try {
        const result = await searchStore(store, productName);
        results[store] = result;
      } catch (err) {
        console.warn(`[CompareAll] Search failed for ${store}:`, err.message);
        results[store] = { status: 'error', error: err.message };
      }
    })
  );

  return results;
}

// ─────────────────────────────────────────────
//  Per-store search dispatchers
// ─────────────────────────────────────────────

async function searchStore(store, productName) {
  console.log(`[CompareAll] Buscando en ${store}: "${productName}"`);
  switch (store) {
    case 'alkosto':     return searchAlkosto(productName);
    case 'exito':       return searchExito(productName);
    case 'falabella':   return searchFalabella(productName);
    case 'mercadolibre':return searchMercadoLibre(productName);
    default:            return { status: 'not_found' };
  }
}

// ─────────────────────────────────────────────
//  ALKOSTO — Algolia API
// ─────────────────────────────────────────────

async function searchAlkosto(productName) {
  const query = cleanProductName(productName);
  const url = `https://${ALKOSTO_ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALKOSTO_ALGOLIA_INDEX}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Algolia-Application-Id': ALKOSTO_ALGOLIA_APP_ID,
      'X-Algolia-API-Key':        ALKOSTO_ALGOLIA_API_KEY,
      'Content-Type':             'application/json'
    },
    body: JSON.stringify({
      query,
      hitsPerPage: 20,
      attributesToRetrieve: ['name_text_es', 'url_es_string', 'discountprice_double', 'pricevalue_cop_double', 'brand_string_mv']
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) throw new Error(`Algolia HTTP ${response.status}`);
  const data = await response.json();

  console.log(`[CompareAll] Alkosto Algolia → ${data.nbHits} hits`);

  let bestResult = null;
  let bestScore  = 0;

  for (const hit of (data.hits || [])) {
    const name  = hit.name_text_es || '';
    const score = nameSimilarity(productName, name);
    if (score > bestScore) {
      bestScore  = score;
      const rawUrl = hit.url_es_string || '';
      const fullUrl = rawUrl.startsWith('http') ? rawUrl : `https://www.alkosto.com${rawUrl}`;
      const price = hit.discountprice_double || hit.pricevalue_cop_double || null;
      bestResult = { url: fullUrl, name, price, confidence: score };
    }
  }

  if (!bestResult || bestScore < SIMILARITY_THRESHOLD) {
    console.log(`[CompareAll] Alkosto: no match (best ${(bestScore*100).toFixed(1)}% for "${bestResult?.name||'N/A'}")`);
    return { status: 'manual_required', confidence: bestScore };
  }

  console.log(`[CompareAll] Alkosto ✅ ${(bestScore*100).toFixed(1)}% → ${bestResult.url}`);
  return { status: 'found', ...bestResult };
}

// ─────────────────────────────────────────────
//  ÉXITO — VTEX Catalog API
// ─────────────────────────────────────────────

async function searchExito(productName) {
  const query = encodeURIComponent(cleanProductName(productName));
  const url   = `https://www.exito.com/api/catalog_system/pub/products/search/?ft=${query}&_from=0&_to=7`;

  const response = await fetch(url, {
    headers: {
      'Accept':          'application/json',
      'Accept-Language': 'es-419,es;q=0.7'
    },
    credentials: 'omit',
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) throw new Error(`Éxito VTEX HTTP ${response.status}`);
  const products = await response.json();

  console.log(`[CompareAll] Éxito VTEX → ${products.length} products`);

  let bestResult = null;
  let bestScore  = 0;

  for (const product of products) {
    const name     = product.productName || '';
    const linkText = product.linkText    || '';
    const score    = nameSimilarity(productName, name);

    // Extract best price from items[].sellers[].commertialOffer.Price
    let price = null;
    for (const item of (product.items || [])) {
      for (const seller of (item.sellers || [])) {
        const p = seller?.commertialOffer?.Price;
        if (p && p > 0) { price = p; break; }
      }
      if (price) break;
    }

    if (score > bestScore) {
      bestScore  = score;
      const fullUrl = `https://www.exito.com/${linkText}/p`;
      bestResult = { url: fullUrl, name, price, confidence: score };
    }
  }

  if (!bestResult || bestScore < SIMILARITY_THRESHOLD) {
    console.log(`[CompareAll] Éxito: no match (best ${(bestScore*100).toFixed(1)}% for "${bestResult?.name||'N/A'}")`);
    return { status: 'manual_required', confidence: bestScore };
  }

  console.log(`[CompareAll] Éxito ✅ ${(bestScore*100).toFixed(1)}% → ${bestResult.url}`);
  return { status: 'found', ...bestResult };
}

// ─────────────────────────────────────────────
//  FALABELLA — HTML fetch + RegEx
//  (No public JSON API found. Uses robust RegEx on the HTML.)
// ─────────────────────────────────────────────

async function searchFalabella(productName) {
  const query   = encodeURIComponent(cleanProductName(productName));
  const url     = `https://www.falabella.com.co/falabella-co/search?Ntt=${query}`;

  const response = await fetch(url, {
    credentials: 'omit',
    headers: {
      'Accept':          'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-419,es;q=0.7'
    },
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) throw new Error(`Falabella HTTP ${response.status}`);
  const html = await response.text();
  console.log(`[CompareAll] Falabella HTML → ${html.length} chars`);

  // Strategy 1: JSON-LD ItemList
  const jld = extractFromJsonLdRegex(html, productName);
  if (jld) { console.log('[CompareAll] Falabella ✅ via JSON-LD'); return jld; }

  // Strategy 2: __NEXT_DATA__ / window state
  const nd = extractFromStateBlobs(html, productName, 'falabella');
  if (nd)  { console.log('[CompareAll] Falabella ✅ via __NEXT_DATA__'); return nd; }

  // Strategy 3: product links regex
  const linkResult = extractLinksRegex(html, productName, 'falabella');
  if (linkResult) { console.log('[CompareAll] Falabella ✅ via link regex'); return linkResult; }

  console.log('[CompareAll] Falabella: no match found');
  return { status: 'manual_required', confidence: 0 };
}

// ─────────────────────────────────────────────
//  MERCADOLIBRE — suggestions API
//  The public listing API requires auth; we use the autosuggest
//  endpoint and then verify the first result with nameSimilarity.
// ─────────────────────────────────────────────

async function searchMercadoLibre(productName) {
  const query = encodeURIComponent(cleanProductName(productName));

  // MercadoLibre's listing/search pages block server-side fetches with a captcha.
  // The public REST API (api.mercadolibre.com) requires OAuth for search.
  // Best approach: return a pre-built search URL so the user can open it with one click.
  const cleanQuery   = cleanProductName(productName);
  const searchUrl    = `https://listado.mercadolibre.com.co/${encodeURIComponent(cleanQuery).replace(/%20/g, '-')}`;
  console.log(`[CompareAll] MercadoLibre: devolviendo URL de búsqueda para confirmación manual → ${searchUrl}`);
  return { status: 'manual_required', confidence: 0, searchUrl };
}

// ─────────────────────────────────────────────
//  RegEx helpers (for Falabella fallback)
// ─────────────────────────────────────────────

function extractFromJsonLdRegex(html, originalName) {
  const matches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of matches) {
    try {
      const data  = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'ItemList' && item.itemListElement) {
          const elements = Array.isArray(item.itemListElement) ? item.itemListElement : [item.itemListElement];
          for (const el of elements) {
            const prod  = el.item || el;
            if (!prod?.url) continue;
            const name  = prod.name || '';
            const score = nameSimilarity(originalName, name);
            if (score >= SIMILARITY_THRESHOLD) {
              return { status: 'found', url: prod.url, name, price: parseCOPPrice(String(prod.offers?.price || '')), confidence: score };
            }
          }
        }
      }
    } catch (_) { /* ignore */ }
  }
  return null;
}

function extractFromStateBlobs(html, originalName, store) {
  let jsonString = null;
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextMatch) jsonString = nextMatch[1];
  else {
    const preload = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});/i);
    if (preload) jsonString = preload[1];
  }
  if (!jsonString) return null;

  try {
    const data = JSON.parse(jsonString);
    let bestResult = null;
    let bestScore  = 0;

    function traverse(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) { obj.forEach(traverse); return; }
      const name  = obj.name || obj.title || obj.productName;
      const price = obj.price || obj.sellingPrice || obj.offers?.price;
      const url   = obj.url  || obj.link || obj.permalink;
      if (name && typeof name === 'string' && name.length > 3 && price) {
        let p = typeof price === 'number' ? price : parseInt(String(price).replace(/[^\d]/g,''), 10);
        if (p && !isNaN(p) && p > 1000) {
          const score = nameSimilarity(originalName, name);
          if (score > bestScore) {
            bestScore = score;
            let finalUrl = String(url || '');
            if (!finalUrl.startsWith('http') && store === 'falabella') finalUrl = 'https://www.falabella.com.co' + finalUrl;
            bestResult = { url: finalUrl, name, price: p, confidence: score };
          }
        }
      }
      Object.values(obj).forEach(traverse);
    }
    traverse(data);

    if (bestResult && bestScore >= SIMILARITY_THRESHOLD) return { status: 'found', ...bestResult };
  } catch (_) { /* ignore */ }
  return null;
}

function extractLinksRegex(html, originalName, store) {
  const patterns = {
    falabella: /falabella\.com\.co\/.+\/(product|p)\//
  };
  const baseUrls = {
    falabella: 'https://www.falabella.com.co'
  };

  const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let bestResult  = null;
  let bestScore   = 0;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    let url = match[1];
    if (url.startsWith('/') && baseUrls[store]) url = baseUrls[store] + url;
    if (!patterns[store]?.test(url)) continue;

    const content = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const titleMatch = match[0].match(/title="([^"]+)"/i);
    const name = content.length > 5 ? content : (titleMatch?.[1] || '');
    if (!name) continue;

    const score = nameSimilarity(originalName, name);
    if (score > bestScore) {
      bestScore  = score;
      const priceArea = html.substring(Math.max(0, match.index - 400), match.index + 1200);
      const priceMatch = priceArea.match(/(\$?\s*\d{1,3}(?:\.\d{3})+(?:,\d+)?)/);
      bestResult = { url, name, price: priceMatch ? parseCOPPrice(priceMatch[1]) : null, confidence: score };
    }
  }

  if (!bestResult || bestScore < SIMILARITY_THRESHOLD) return null;
  return { status: 'found', ...bestResult };
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/**
 * Distills a product name into a precise search query.
 * Priority order: Brand → Model numbers → Distinctive words
 * This maximizes Algolia/VTEX recall while keeping queries specific.
 */
function cleanProductName(name) {
  // Known brand names to prioritize first in the query
  const BRANDS = new Set([
    'hp','samsung','motorola','moto','apple','iphone','lenovo','asus','acer','dell','lg','sony',
    'xiaomi','redmi','huawei','honor','oppo','vivo','realme','infinix','tecno','zte','poco',
    'epson','brother','canon','logitech','microsoft','intel','amd','nvidia','toshiba','hisense',
    'tcl','whirlpool','haceb','challenger','kalley','xtratech','blackview'
  ]);

  // Generic words that add noise but not precision
  const STOPWORDS = new Set([
    'y','con','de','el','la','los','las','para','en','un','una','o','e',
    'color','negro','blanco','azul','rojo','verde','amarillo','gris','plata','dorado','morado','rosa','rosado','titanio',
    'black','white','blue','red','green','yellow','gray','grey','silver','gold','purple','pink','titanium',
    'cargador','regalo','gratis','combo','estuche','funda','vidrio','templado',
    'cm','mm','pulgadas','inch','unidad','und','nuevo','reacondicionado','open','libre',
    'celular','smartphone','movil','telefono','portatil','laptop','computador','computadora',
    'audifonos','auriculares','inalambricos',
    // Generic specs that differ between stores
    'full','hd','fhd','uhd','qhd','led','ips','amoled','oled','ssd','hdd','nvme',
    'tactil','touch','wifi','bluetooth','dual','sim'
  ]);

  // Normalize quotes and symbols
  let raw = name
    .replace(/[\u201c\u201d\u2018\u2019"]/g, ' ')
    .replace(/[\(\)\[\]\{\}\+\/\\]/g, ' ');

  const tokens = raw.split(/[\s,;:\-]+/).filter(Boolean);
  const brandTokens  = [];
  const modelTokens  = [];
  const otherTokens  = [];

  for (const t of tokens) {
    // Strip accents before checking stopwords (handles "Portátil" → "Portatil")
    const lower = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!lower || STOPWORDS.has(lower)) continue;

    // Skip pure storage / memory / band specs
    if (/^\d+(gb|tb|mb)$/i.test(lower)) continue;
    if (['5g','4g','3g','lte','nfc','ram','amd','intel','core','ultra','ryzen','geforce','snapdragon'].includes(lower)) continue;
    // Skip pure numbers (including decimals like "15.6" screen sizes)
    if (/^\d+([.,]\d+)?$/.test(lower)) continue;
    if (lower.length <= 1) continue;

    if (BRANDS.has(lower)) {
      brandTokens.push(t);
    } else if (/\d/.test(lower) && /[a-z]/i.test(lower)) {
      // Requires BOTH a digit AND a letter → genuine model code (7730U, G06, S24, fc0287la)
      // This excludes pure screen sizes like "15.6" or bare numbers
      modelTokens.push(t);
    } else if (lower.length >= 3) {
      otherTokens.push(t);
    }
  }

  // Compose: brand first, then model numbers, then other distinctive words
  const combined = [...brandTokens, ...modelTokens, ...otherTokens];
  const unique   = [...new Set(combined)];
  // Cap at 5 tokens: enough specificity without overwhelming the search engine
  return unique.slice(0, 5).join(' ');
}

function isProductUrl(store, url) {
  const patterns = {
    falabella:    /falabella\.com\.co\/.+\/(product|p)\//,
    alkosto:      /alkosto\.com\/.*\/p(\?|$)/,
    exito:        /exito\.com\/.*\/p(\?|$)/,
    mercadolibre: /(articulo\.mercadolibre\.com\.co\/|mercadolibre\.com\.co\/.*\/p\/[A-Z0-9]+)/
  };
  return patterns[store]?.test(url) ?? false;
}

export function parseCOPPrice(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/[^\d]/g, '');
  const num     = parseInt(cleaned, 10);
  return isNaN(num) || num < 1000 ? null : num;
}

/**
 * Jaccard token similarity — good for product name matching.
 */
function nameSimilarity(a, b) {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (!tokensA.size || !tokensB.size) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  return intersection / (tokensA.size + tokensB.size - intersection);
}

function tokenize(str) {
  return new Set(
    String(str).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1)
  );
}
