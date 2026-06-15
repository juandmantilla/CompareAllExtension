/**
 * falabella.js — Content script for falabella.com.co
 * Detects product pages and shows a manual track button.
 */

(async function () {
  const utils = window.CompareAllUtils;
  if (!utils) return;

  // Only run on product detail pages
  if (!isProductPage()) return;

  // Wait for dynamic content to load
  await new Promise(r => setTimeout(r, 1500));

  const data = extractProductData();
  if (!data || !data.price) {
    console.warn('[CompareAll Falabella] Could not extract product data.');
    return;
  }

  // Inject manual track button (NO automatic tracking)
  utils.injectTrackButton('falabella', data);
})();

function isProductPage() {
  const url = window.location.href;
  return /falabella\.com\.co\/falabella-co\/(product|p)\//.test(url) ||
         /falabella\.com\.co\/falabella-co\/[^/]+\/[A-Z0-9]+/.test(url);
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
  const ogName  = document.querySelector('meta[property="og:title"]')?.content;
  const ogImage = document.querySelector('meta[property="og:image"]')?.content;
  const ogSku   = document.querySelector('meta[property="product:retailer_item_id"]')?.content;

  if (ogPrice) {
    const price = parseFloat(ogPrice.replace(/[^\d.]/g, ''));
    if (price > 1000) {
      return { name: ogName, price, image: ogImage, sku: ogSku };
    }
  }

  // Strategy 3: DOM selectors
  const priceSelectors = [
    '[data-internet-price]',
    '.product-price .copy10',
    '[class*="price-display"]',
    '[class*="jsx-price"]',
    '[itemprop="price"]',
    '.product-form__price'
  ];

  const priceText = utils.getText(priceSelectors);
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
    'h1.product-name',
    'h1[class*="product-title"]',
    'h1[class*="ProductTitle"]',
    '[data-product-name]',
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
  // Try multiple strategies for image
  const strategies = [
    () => utils.getImageFromElement(document.querySelector('meta[property="og:image"]')),
    () => utils.getImageFromElement(document.querySelector('.product-image img')),
    () => utils.getImageFromElement(document.querySelector('[class*="product-image"] img')),
    () => utils.getImageFromElement(document.querySelector('picture source')),
    () => utils.getImageFromElement(document.querySelector('[class*="gallery"] img')),
  ];
  for (const strategy of strategies) {
    const url = strategy();
    if (url) return url;
  }
  return null;
}

function getSkuFallback() {
  return document.querySelector('meta[property="product:retailer_item_id"]')?.content ||
         document.querySelector('[data-product-id]')?.dataset?.productId ||
         window.location.pathname.split('/').filter(Boolean).pop() ||
         null;
}
