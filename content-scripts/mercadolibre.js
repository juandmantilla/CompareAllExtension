/**
 * mercadolibre.js — Content script for mercadolibre.com.co
 * Detects product pages and shows a manual track button.
 * Supports TWO URL formats:
 *   1. articulo.mercadolibre.com.co/MCO-XXXXXXXXX  (individual listings)
 *   2. www.mercadolibre.com.co/{slug}/p/MCO{id}     (canonical product pages)
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

  // Inject manual track button (NO automatic tracking)
  utils.injectTrackButton('mercadolibre', data);
})();

function isProductPage() {
  const url = window.location.href;
  // Format 1: articulo.mercadolibre.com.co/MCO-XXXXXXXXX
  if (/articulo\.mercadolibre\.com\.co\/MCO-/.test(url)) return true;
  // Format 2: www.mercadolibre.com.co/{slug}/p/MCO{id}
  if (/mercadolibre\.com\.co\/[^/]+\/p\/MCO\d+/.test(url)) return true;
  return false;
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
        image: getImageFallback(),
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
  const utils = window.CompareAllUtils;
  // MercadoLibre uses gallery with lazy-loaded images
  const strategies = [
    () => utils.getImageFromElement(document.querySelector('meta[property="og:image"]')),
    () => utils.getImageFromElement(document.querySelector('.ui-pdp-gallery__figure img')),
    () => utils.getImageFromElement(document.querySelector('[data-zoom]')),
    () => utils.getImageFromElement(document.querySelector('.ui-pdp-image')),
    () => utils.getImageFromElement(document.querySelector('figure img')),
    () => utils.getImageFromElement(document.querySelector('picture source')),
    () => {
      // Try all gallery images
      const imgs = document.querySelectorAll('.ui-pdp-gallery img, figure img, [class*="gallery"] img');
      for (const img of imgs) {
        const url = utils.getImageFromElement(img);
        if (url) return url;
      }
      return null;
    }
  ];
  for (const strategy of strategies) {
    const url = strategy();
    if (url) return url;
  }
  return null;
}

function getSkuFallback() {
  // Try input field first
  const inputVal = document.querySelector('input[name="item_id"]')?.value;
  if (inputVal) return inputVal;
  // Extract MCO ID from URL
  const mcoMatch = window.location.href.match(/MCO[- ]?\d+/);
  if (mcoMatch) return mcoMatch[0].replace('-', '');
  // Extract from pathname for /p/MCO format
  const pathMatch = window.location.pathname.match(/\/p\/(MCO\d+)/);
  if (pathMatch) return pathMatch[1];
  return null;
}
