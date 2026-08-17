/**
 * search.js — Cross-store automatic product search
 * Searches for a product by name across all configured stores.
 * Uses verified JSON APIs for each store (no HTML scraping).
 *
 * Strategies:
 *  - Alkosto   : Algolia REST API (credentials embedded in their public HTML)
 *  - Éxito     : VTEX Catalog API (public, no auth required)
 *  - Falabella : HTML search with RegEx fallback (no public JSON API available)
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
 * Aplica enriquecimiento desde Internet para extraer el modelo técnico oficial antes de consultar.
 * @param {string} productName  - Nombre completo del producto
 * @param {string} sourceStore  - Tienda donde se encontró originalmente
 * @returns {Object} { storeName: { status, url, name, price, confidence } }
 */
export async function searchAllStores(productName, sourceStore) {
  // Intentar enriquecer la consulta buscando especificaciones técnicas/modelos en internet
  const enrichedTerm = await enrichProductFromInternet(productName);
  const queryToUse   = enrichedTerm || productName;

  if (enrichedTerm) {
    console.log(`[CompareAll] Consulta enriquecida desde Internet: "${queryToUse}"`);
  }

  const allStores = ['alkosto', 'exito', 'falabella'];
  const targetStores = allStores.filter(s => s !== sourceStore);
  const results = {};

  await Promise.allSettled(
    targetStores.map(async (store) => {
      try {
        const result = await searchStore(store, queryToUse);
        results[store] = result;
      } catch (err) {
        console.warn(`[CompareAll] Search failed for ${store}:`, err.message);
        results[store] = { status: 'error', error: err.message };
      }
    })
  );

  return results;
}

/**
 * Consulta la web para extraer códigos de modelo o número de parte oficial (MPN).
 */
async function enrichProductFromInternet(productName) {
  try {
    const cleaned = cleanProductName(productName);
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleaned + ' especificaciones modelo oficial')}`;
    const response = await fetch(searchUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml;q=0.9',
        'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(4000)
    });

    if (!response.ok) return null;
    const html = await response.text();

    // Buscar códigos de modelo en fragmentos web (ej. 15-fc0287la, SM-R177, G06)
    const modelMatches = html.match(/\b([a-z0-9]{2,5}\-[a-z0-9]{4,8}|[a-z]{1,3}\d{3,4}[a-z]{0,4})\b/gi) || [];
    const validModels = modelMatches.filter(m => {
      const lower = m.toLowerCase();
      return /\d/.test(lower) && /[a-z]/.test(lower) && !/^\d+(gb|tb|mb|g|hz|w)$/i.test(lower);
    });

    if (validModels.length > 0) {
      const topModel = validModels[0];
      console.log(`[CompareAll WebEnrich] Modelo oficial identificado en la web: "${topModel}"`);
      return `${cleaned} ${topModel}`;
    }
  } catch (err) {
    console.debug('[CompareAll WebEnrich] Enriquecimiento omitido:', err.message);
  }
  return null;
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

function isProductUrl(store, url) {
  const patterns = {
    falabella:    /falabella\.com\.co\/.+\/(product|p)\//,
    alkosto:      /alkosto\.com\/.*\/p(\?|$)/,
    exito:        /exito\.com\/.*\/p(\?|$)/
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
 * Enhanced similarity metric combining Jaccard token similarity with
 * Model-Number / MPN matching.
 * Gives a significant bonus (+0.35) when both product titles share exact model numbers
 * (e.g., 7730U, G06, SM-R177), and applies a penalty if different model codes are detected.
 */
function nameSimilarity(a, b) {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (!tokensA.size || !tokensB.size) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const jaccard = intersection / (tokensA.size + tokensB.size - intersection);

  // Extract model codes (containing both digits and letters, e.g. 7730u, g06, s24)
  const modelsA = extractModelCodes(a);
  const modelsB = extractModelCodes(b);

  let bonus = 0;
  if (modelsA.size > 0 && modelsB.size > 0) {
    let commonModels = 0;
    for (const m of modelsA) {
      if (modelsB.has(m)) commonModels++;
    }
    if (commonModels > 0) {
      bonus = 0.35; // Exact model code match bonus!
    } else {
      bonus = -0.25; // Different model codes detected!
    }
  }

  const score = jaccard + bonus;
  return Math.max(0, Math.min(1, score));
}

function extractModelCodes(str) {
  const tokens = String(str).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s\-]/g, ' ')
    .split(/\s+/);
  
  const models = new Set();
  for (const t of tokens) {
    // Requires BOTH digit and letter, excluding specs like 512gb, 16gb, 4g
    if (/\d/.test(t) && /[a-z]/i.test(t) && !/^\d+(gb|tb|mb|g)$/i.test(t)) {
      models.add(t);
    }
  }
  return models;
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

function cleanProductName(name) {
  if (!name) return '';
  return String(name)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(nuevo|unidad|und|color|negro|blanco|plateado|dorado|pulgadas|full hd|led)\b/gi, '')
    .replace(/[^\w\s\.-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function extractFromJsonLdRegex(html, originalName) {
  try {
    const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const scriptTag of scripts) {
      const content = scriptTag.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
      try {
        const data = JSON.parse(content);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'ItemList' && Array.isArray(item.itemListElement)) {
            const first = item.itemListElement[0];
            const prod = first?.item || first;
            if (prod && prod.url) {
              const name = prod.name || '';
              const price = prod.offers?.price || prod.offers?.lowPrice || null;
              const score = nameSimilarity(originalName, name);
              if (score >= SIMILARITY_THRESHOLD) {
                return { status: 'found', url: prod.url, name, price, confidence: score };
              }
            }
          }
        }
      } catch (_) {}
    }
  } catch (_) {}
  return null;
}

function extractFromStateBlobs(html, originalName, store) {
  try {
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (match && match[1]) {
      const data = JSON.parse(match[1]);
      const products = data?.props?.pageProps?.results || data?.props?.pageProps?.products || [];
      let bestResult = null;
      let bestScore = 0;
      for (const p of products) {
        const name = p.displayName || p.name || p.title || '';
        const url = p.url || (p.productId ? `https://www.falabella.com.co/falabella-co/product/${p.productId}` : null);
        const price = p.prices?.[0]?.price?.[0] || p.price || null;
        if (name && url) {
          const score = nameSimilarity(originalName, name);
          if (score > bestScore) {
            bestScore = score;
            bestResult = { status: 'found', url, name, price, confidence: score };
          }
        }
      }
      if (bestResult && bestScore >= SIMILARITY_THRESHOLD) return bestResult;
    }
  } catch (_) {}
  return null;
}

function extractLinksRegex(html, originalName, store) {
  try {
    const linkRegex = /href=["'](https:\/\/www\.falabella\.com\.co\/falabella-co\/product\/[^"']+)["']/gi;
    const matches = [...html.matchAll(linkRegex)];
    const uniqueUrls = [...new Set(matches.map(m => m[1]))];

    if (uniqueUrls.length > 0) {
      const url = uniqueUrls[0];
      return { status: 'found', url, name: originalName, price: null, confidence: 0.5 };
    }
  } catch (_) {}
  return null;
}

