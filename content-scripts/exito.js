/**
 * exito.js — Content script for exito.com (VTEX platform)
 * Detects product pages and extracts price, name, image, and SKU.
 */

(async function () {
  const utils = window.CompareAllUtils;
  if (!utils) return;

  if (!isProductPage()) return;

  // VTEX pages are fully React-rendered, wait for price element
  await waitForPrice();

  const data = extractProductData();
  if (!data || !data.price) {
    console.warn('[CompareAll Éxito] Could not extract product data.');
    return;
  }

  utils.injectBadge('saving');
  chrome.runtime.sendMessage({
    action: 'PRICE_CAPTURED',
    store: 'exito',
    ...data,
    url: window.location.href
  }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response?.success) utils.injectBadge('tracked');
  });
})();

function isProductPage() {
  const url = window.location.href;
  return /exito\.com\/[^/]+\/p(\?|$)/.test(url) ||
         /exito\.com\/producto\/[^/]+/.test(url);
}

async function waitForPrice() {
  const selectors = [
    '[class*="sellingPriceValue"]',
    '[class*="selling-price"]',
    '[data-testid="price-value"]',
    '[itemprop="price"]'
  ];
  for (const sel of selectors) {
    const el = await window.CompareAllUtils.waitForElement(sel, 6000);
    if (el) return el;
  }
  await new Promise(r => setTimeout(r, 2500));
  return null;
}

function extractProductData() {
  const utils = window.CompareAllUtils;

  // Strategy 1: JSON-LD (VTEX usually includes this)
  const ld = utils.extractFromJsonLd();
  if (ld?.price && ld.price > 1000) {
    return {
      name: ld.name || getNameFallback(),
      price: ld.price,
      image: ld.image || getImageFallback(),
      sku: ld.sku || getSkuFallback()
    };
  }

  // Strategy 2: Open Graph
  const ogPrice = document.querySelector('meta[property="product:price:amount"]')?.content;
  if (ogPrice) {
    const price = parseFloat(ogPrice.replace(/[^\d.]/g, ''));
    if (price > 1000) {
      return {
        name: document.querySelector('meta[property="og:title"]')?.content,
        price,
        image: document.querySelector('meta[property="og:image"]')?.content,
        sku: getSkuFallback()
      };
    }
  }

  // Strategy 3: DOM selectors (VTEX-specific class names)
  const priceSelectors = [
    '[class*="exito-vtexextension"][class*="sellingPriceValue"]',
    '[class*="sellingPriceValue"]',
    '[class*="selling-price"]',
    '[class*="priceContainer"] [class*="price"]',
    '[data-testid="price-value"]',
    'span.andes-money-amount__fraction',
    '[itemprop="price"]'
  ];

  const priceText = utils.getText(priceSelectors) ||
                    document.querySelector('[itemprop="price"]')?.getAttribute('content');
  const price = utils.parseCOPPrice(priceText);

  return {
    name: getNameFallback(),
    price,
    image: getImageFallback(),
    sku: getSkuFallback()
  };
}

function getNameFallback() {
  const selectors = [
    'h1[class*="product-name"]',
    'h1[class*="productName"]',
    'h1[class*="ProductTitle"]',
    '[class*="product-header"] h1',
    'h1'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent.trim()) return el.textContent.trim();
  }
  return document.title.split('|')[0].trim();
}

function getImageFallback() {
  return document.querySelector('meta[property="og:image"]')?.content ||
         document.querySelector('[class*="productImage"] img, [class*="vtex-store-components"] img')?.src ||
         null;
}

function getSkuFallback() {
  return document.querySelector('[data-product-reference]')?.dataset?.productReference ||
         document.querySelector('[data-sku]')?.dataset?.sku ||
         window.location.pathname.split('/').filter(Boolean).slice(-1)[0]?.replace('/p', '') ||
         null;
}
