/**
 * mercadolibre.js — Content script for mercadolibre.com.co
 * Detects product pages and extracts price, name, image, and SKU.
 */

(async function () {
  const utils = window.CompareAllUtils;
  if (!utils) return;

  if (!isProductPage()) return;

  // Wait for dynamic content to load
  await new Promise(r => setTimeout(r, 1500));

  const data = extractProductData();
  if (!data || !data.price) {
    console.warn('[CompareAll MercadoLibre] Could not extract product data.');
    return;
  }

  // Send to service worker
  utils.injectBadge('saving');
  chrome.runtime.sendMessage({
    action: 'PRICE_CAPTURED',
    store: 'mercadolibre',
    ...data,
    url: window.location.href
  }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response?.success) utils.injectBadge('tracked');
  });
})();

function isProductPage() {
  const url = window.location.href;
  return /articulo\.mercadolibre\.com\.co\/MCO-/.test(url);
}

function extractProductData() {
  const utils = window.CompareAllUtils;

  // Strategy 1: JSON-LD structured data (most reliable)
  const ld = utils.extractFromJsonLd();
  if (ld?.price && ld.price > 1000) {
    return {
      name: ld.name || getNameFallback(),
      price: ld.price,
      image: ld.image || getImageFallback(),
      sku: ld.sku || getSkuFallback()
    };
  }

  // Strategy 2: Open Graph meta tags
  const ogPrice = document.querySelector('meta[property="product:price:amount"]')?.content;
  if (ogPrice) {
    const price = parseFloat(ogPrice.replace(/[^\d.]/g, ''));
    if (price > 1000) {
      return {
        name: document.querySelector('meta[property="og:title"]')?.content || getNameFallback(),
        price,
        image: document.querySelector('meta[property="og:image"]')?.content || getImageFallback(),
        sku: getSkuFallback()
      };
    }
  }

  // Strategy 3: DOM selectors
  const priceSelectors = [
    '.ui-pdp-price__second-line .andes-money-amount__fraction',
    '[itemprop="price"]',
    '.andes-money-amount__fraction'
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
    'h1.ui-pdp-title',
    '[itemprop="name"]',
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
         document.querySelector('.ui-pdp-gallery__figure img')?.src ||
         null;
}

function getSkuFallback() {
  return document.querySelector('input[name="item_id"]')?.value ||
         window.location.pathname.match(/MCO-?\d+/)?.[0]?.replace('-', '') ||
         null;
}
