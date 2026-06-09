/**
 * search.js — Cross-store automatic product search
 * Searches for a product by name across all configured stores.
 * Returns matching URLs ranked by name similarity.
 */

const SEARCH_ENDPOINTS = {
  falabella: 'https://www.falabella.com.co/falabella-co/search?Ntt={query}',
  alkosto:   'https://www.alkosto.com/search?text={query}',
  exito:     'https://www.exito.com/search?text={query}'
};

const SIMILARITY_THRESHOLD = 0.55; // 55% — búsqueda en Colombia tiene palabras en español

/**
 * Busca un producto en todas las tiendas excepto la tienda origen.
 * @param {string} productName - Nombre del producto
 * @param {string} sourceStore - Tienda donde se encontró originalmente
 * @returns {Object} { storeName: { url, name, price, confidence } }
 */
export async function searchAllStores(productName, sourceStore) {
  const targetStores = Object.keys(SEARCH_ENDPOINTS).filter(s => s !== sourceStore);
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

/**
 * Busca un producto en una tienda específica.
 */
async function searchStore(store, productName) {
  const query = encodeURIComponent(cleanProductName(productName));
  const url = SEARCH_ENDPOINTS[store].replace('{query}', query);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CompareAll/1.0)',
      'Accept': 'text/html,application/xhtml+xml'
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseSearchResults(store, html, productName);
}

/**
 * Parsea los resultados de búsqueda del HTML de cada tienda.
 */
function parseSearchResults(store, html, originalName) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Try JSON-LD first (most reliable)
  const jsonLdResult = extractFromJsonLd(doc, originalName);
  if (jsonLdResult) return jsonLdResult;

  // Fallback: DOM scraping per store
  const configs = {
    falabella: {
      cards: ['[class*="pod-subPod"]', '.product-card', '[class*="ProductCard"]'],
      links: ['a[href*="/product/"]', 'a[href*="/p/"]'],
      names: ['[class*="pod-displayName"]', '[class*="product-display-name"]', 'b.product-title'],
      prices: ['[class*="price-display"]', '[data-internet-price]', '[class*="copy10"]']
    },
    alkosto: {
      cards: ['.product-item', '.ais-Hits-item', '[class*="product-item"]'],
      links: ['a.product-item__image-link', 'a[href*=".com/"][href$="/p"]'],
      names: ['.product-item__title', '[class*="product-name"]', 'h2 a'],
      prices: ['.price__offer--price', '[class*="price-offer"]', '.js-price-display']
    },
    exito: {
      cards: ['[class*="galleryItem"]', '[class*="product-summary"]', '[class*="ProductCard"]'],
      links: ['a[href*="/p"]', 'a[class*="product-link"]'],
      names: ['[class*="product-summary-name"]', '[class*="productName"]', 'h2 a'],
      prices: ['[class*="sellingPriceValue"]', '[class*="selling-price"]', '[data-testid="price-value"]']
    }
  };

  const config = configs[store];
  if (!config) return { status: 'not_found' };

  // Find product cards
  let cards = [];
  for (const sel of config.cards) {
    cards = [...doc.querySelectorAll(sel)];
    if (cards.length > 0) break;
  }

  if (!cards.length) {
    // Last resort: get all links that look like product pages
    const allLinks = [...doc.querySelectorAll('a[href]')]
      .filter(a => isProductUrl(store, a.href));
    if (!allLinks.length) return { status: 'not_found' };
    cards = allLinks.map(a => a.parentElement || a);
  }

  // Score each card by name similarity
  let bestResult = null;
  let bestScore = 0;

  for (const card of cards.slice(0, 10)) {
    // Extract link
    let link = null;
    for (const sel of config.links) {
      const el = card.querySelector(sel) || (card.matches(sel) ? card : null);
      if (el) { link = el.href; break; }
    }
    if (!link) {
      const a = card.querySelector('a[href]');
      link = a ? a.href : null;
    }
    if (!link) continue;

    // Extract name
    let name = '';
    for (const sel of config.names) {
      const el = card.querySelector(sel);
      if (el) { name = el.textContent.trim(); break; }
    }
    if (!name) name = card.textContent.trim().split('\n')[0];

    // Extract price
    let price = null;
    for (const sel of config.prices) {
      const el = card.querySelector(sel);
      if (el) { price = parseCOPPrice(el.textContent); break; }
    }

    // Calculate similarity
    const score = nameSimilarity(originalName, name);
    if (score > bestScore) {
      bestScore = score;
      bestResult = { url: link, name, price, confidence: score };
    }
  }

  if (!bestResult || bestScore < SIMILARITY_THRESHOLD) {
    return { status: 'manual_required', confidence: bestScore || 0 };
  }

  return { status: 'found', ...bestResult };
}

function extractFromJsonLd(doc, originalName) {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'ItemList' && item.itemListElement) {
          // Search result page with structured data
          const first = item.itemListElement[0];
          if (first && first.url) {
            return {
              status: 'found',
              url: first.url,
              name: first.name || '',
              price: first.offers?.price || null,
              confidence: 0.8
            };
          }
        }
      }
    } catch (_) { /* ignore */ }
  }
  return null;
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

function cleanProductName(name) {
  // Remove common filler words in Spanish for better search
  return name
    .replace(/\b(nuevo|nuevo|unidad|und|color|negro|blanco|plateado|dorado|gb|tb|pulgadas|")\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100); // Limit query length
}

function isProductUrl(store, url) {
  const patterns = {
    falabella: /falabella\.com\.co\/.+\/(product|p)\//,
    alkosto: /alkosto\.com\/.+\/p$/,
    exito: /exito\.com\/.+\/p$/
  };
  return patterns[store]?.test(url) || false;
}

export function parseCOPPrice(text) {
  if (!text) return null;
  // Handle Colombian price format: $1.299.900 or 1299900 or 1,299,900
  const cleaned = text.replace(/[^\d]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) || num < 1000 ? null : num;
}

/**
 * Simple string similarity using token overlap (Jaccard-like).
 * Works well for product names with brand + model.
 */
function nameSimilarity(a, b) {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (!tokensA.size || !tokensB.size) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return intersection / union;
}

function tokenize(str) {
  return new Set(
    str.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1)
  );
}
