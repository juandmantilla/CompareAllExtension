/**
 * alkosto.js — Content script for alkosto.com
 * Detects product pages and shows a manual track button.
 */

(async function () {
  const utils = window.CompareAllUtils;
  if (!utils) return;

  if (!isProductPage()) return;

  // Alkosto uses VTEX/custom React — wait for price to render
  await waitForPrice();

  const data = extractProductData();
  if (!data || !data.price) {
    console.warn('[CompareAll Alkosto] Could not extract product data.');
    return;
  }

  // Inject manual track button (NO automatic tracking)
  utils.injectTrackButton('alkosto', data);
})();

function isProductPage() {
  const url = window.location.href;
  return /alkosto\.com\/.*\/p(\/|\?|$)/.test(url) ||
         /alkosto\.com\/catalogo\/[^/]+/.test(url);
}

async function waitForPrice() {
  const selectors = [
    '.price__offer--price',
    '.js-price-display',
    '[class*="price-offer"]',
    '[itemprop="price"]'
  ];

  for (const sel of selectors) {
    const el = await window.CompareAllUtils.waitForElement(sel, 5000);
    if (el) return el;
  }
  // Fallback: just wait fixed time
  await new Promise(r => setTimeout(r, 2000));
  return null;
}

function extractProductData() {
  const utils = window.CompareAllUtils;

  // Strategy 1: JSON-LD
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
        image: getImageFallback(),
        sku: getSkuFallback()
      };
    }
  }

  // Strategy 3: DOM
  const priceSelectors = [
    '.price__offer--price',
    '.js-price-display',
    '[class*="price-offer"]',
    '[class*="price__offer"]',
    'span.andes-money-amount__fraction',
    '[itemprop="price"]',
    '.product-form__price'
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
    'h1.product__title',
    'h1[class*="product-title"]',
    'h1[class*="ProductTitle"]',
    '.product-name h1',
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
  // Try multiple strategies — Alkosto uses data-src for lazy loading
  const strategies = [
    () => utils.getImageFromElement(document.querySelector('meta[property="og:image"]')),
    () => utils.getImageFromElement(document.querySelector('.product-images img')),
    () => utils.getImageFromElement(document.querySelector('#product-image img')),
    () => utils.getImageFromElement(document.querySelector('[class*="product-gallery"] img')),
    () => utils.getImageFromElement(document.querySelector('[class*="product__gallery"] img')),
    () => utils.getImageFromElement(document.querySelector('.js-zoom-image')),
    () => utils.getImageFromElement(document.querySelector('picture source')),
    // Alkosto sometimes puts image in a data-src or data-zoom attribute
    () => {
      const imgs = document.querySelectorAll('.product-images img, .product__gallery img, [class*="gallery"] img');
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
  return document.querySelector('[data-product-sku]')?.dataset?.productSku ||
         document.querySelector('[data-itemid]')?.dataset?.itemid ||
         new URLSearchParams(window.location.search).get('sku') ||
         window.location.pathname.split('/').filter(Boolean).slice(-1)[0]?.replace('/p', '') ||
         null;
}
