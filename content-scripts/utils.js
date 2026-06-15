/**
 * utils.js — Shared helpers for all content scripts
 * Injected before the store-specific content script.
 */

// Make helpers available globally for other content scripts
window.CompareAllUtils = {

  /**
   * Waits for an element to appear in the DOM (handles async rendering).
   */
  waitForElement(selector, timeout = 8000) {
    return new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
    });
  },

  /**
   * Extract price from a Colombian price string.
   * Handles: "$1.299.900", "1299900", "1,299,900"
   */
  parseCOPPrice(text) {
    if (!text) return null;
    const cleaned = text.replace(/[^\d]/g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) || num < 1000 ? null : num;
  },

  /**
   * Formats a number as COP currency.
   */
  formatCOP(price) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(price);
  },

  /**
   * Tries to extract structured data from JSON-LD scripts on the page.
   */
  extractFromJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'Product') {
            const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            const price = offer?.price || offer?.lowPrice;
            const imageRaw = item.image;
            let image = null;
            if (Array.isArray(imageRaw)) {
              image = imageRaw[0];
            } else if (typeof imageRaw === 'string') {
              image = imageRaw;
            }
            return {
              name: item.name || null,
              price: price ? parseFloat(String(price).replace(/[^\d.]/g, '')) : null,
              image: image,
              sku: item.sku || item.mpn || null
            };
          }
        }
      } catch (_) { /* ignore malformed JSON-LD */ }
    }
    return null;
  },

  /**
   * Extracts text content from the first matching selector.
   */
  getText(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el.textContent.trim();
    }
    return null;
  },

  /**
   * Extracts an attribute value from the first matching selector.
   */
  getAttr(selectors, attr) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const val = el.getAttribute(attr) || el.dataset?.[attr];
        if (val) return val;
      }
    }
    return null;
  },

  /**
   * Validates an image URL — rejects placeholders, empty, or data: URIs that are too short.
   */
  isValidImageUrl(url) {
    if (!url) return false;
    if (typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    // Reject known placeholder patterns
    const rejectPatterns = ['placeholder', 'default', 'noimage', 'no-image', 'blank.', 'spacer.', '1x1.'];
    if (rejectPatterns.some(p => lower.includes(p))) return false;
    // Reject very short data: URIs (probably placeholder pixels)
    if (lower.startsWith('data:') && url.length < 200) return false;
    // Must be http(s) or starts with //
    if (!lower.startsWith('http') && !lower.startsWith('//')) return false;
    return true;
  },

  /**
   * Gets an image URL from an element, checking src, data-src, srcset, and content attribute.
   */
  getImageFromElement(el) {
    if (!el) return null;
    const utils = window.CompareAllUtils;
    // For <meta> tags, use content attribute
    if (el.tagName === 'META') {
      const content = el.getAttribute('content');
      if (utils.isValidImageUrl(content)) return content;
      return null;
    }
    // For <source> tags, use srcset
    if (el.tagName === 'SOURCE') {
      const srcset = el.getAttribute('srcset');
      if (srcset) {
        const firstUrl = srcset.split(',')[0].trim().split(' ')[0];
        if (utils.isValidImageUrl(firstUrl)) return firstUrl;
      }
      return null;
    }
    // For <img> and others, try src, then data-src
    const src = el.getAttribute('src');
    if (utils.isValidImageUrl(src)) return src;
    const dataSrc = el.getAttribute('data-src');
    if (utils.isValidImageUrl(dataSrc)) return dataSrc;
    const dataZoomSrc = el.getAttribute('data-zoom');
    if (utils.isValidImageUrl(dataZoomSrc)) return dataZoomSrc;
    return null;
  },

  /**
   * Injects a floating "Track with CompareAll" button on the bottom-right corner.
   * The button sends PRICE_CAPTURED to the service worker when clicked.
   * If the product is already tracked, shows a status badge instead.
   *
   * @param {string} storeName - Store identifier (e.g. 'falabella')
   * @param {object} productData - { name, price, image, sku }
   */
  injectTrackButton(storeName, productData) {
    // Remove any existing CompareAll elements
    const existing = document.getElementById('compareall-track-btn');
    if (existing) existing.remove();
    const existingBadge = document.getElementById('compareall-badge');
    if (existingBadge) existingBadge.remove();

    // Store data globally so GET_PAGE_DATA can return it
    window._compareAllPageData = { store: storeName, ...productData };

    // Check if this product is already tracked
    chrome.runtime.sendMessage({
      action: 'CHECK_TRACKED',
      url: window.location.href
    }, (response) => {
      if (chrome.runtime.lastError) {
        // Extension context invalidated, just show the button anyway
        _createTrackButton(storeName, productData);
        return;
      }
      if (response?.tracked) {
        _showAlreadyTrackedBadge();
      } else {
        _createTrackButton(storeName, productData);
      }
    });
  },

  /**
   * Injects a small floating badge into the page to signal tracking status.
   * If a badge already exists (e.g. 'saving' state), updates it in-place
   * instead of silently aborting — this allows the transition saving→tracked.
   */
  injectBadge(status = 'tracked') {
    const TEXTS = {
      saving:  '📊 CompareAll: Guardando...',
      tracked: '📊 CompareAll: Rastreado ✓',
      error:   '⚠️ CompareAll: Error al guardar'
    };
    const COLORS = {
      saving:  '#1a4f8f',
      tracked: '#1a7f4b',
      error:   '#8f1a1a'
    };

    // If badge already exists, update it in-place (saving → tracked transition)
    const existing = document.getElementById('compareall-badge');
    if (existing) {
      existing.innerHTML = TEXTS[status] || TEXTS.tracked;
      existing.style.backgroundColor = COLORS[status] || COLORS.tracked;
      // If we just transitioned to a final state, start the auto-hide timer
      if (status !== 'saving') {
        setTimeout(() => {
          existing.style.opacity = '0';
          setTimeout(() => existing.remove(), 400);
        }, 4000);
      }
      return;
    }

    const badge = document.createElement('div');
    badge.id = 'compareall-badge';
    badge.innerHTML = TEXTS[status] || TEXTS.tracked;

    Object.assign(badge.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: '2147483647',
      backgroundColor: COLORS[status] || COLORS.tracked,
      color: '#ffffff',
      padding: '8px 14px',
      borderRadius: '20px',
      fontSize: '13px',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: '600',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      cursor: 'pointer',
      transition: 'opacity 0.3s ease',
      userSelect: 'none'
    });

    badge.title = 'Abre CompareAll para ver el historial de precios';
    document.body.appendChild(badge);

    // Only auto-hide once we reach a final state (not while 'saving')
    if (status !== 'saving') {
      setTimeout(() => {
        badge.style.opacity = '0';
        setTimeout(() => badge.remove(), 400);
      }, 4000);
    }
  }
};

// ─────────────────────────────────────────────
//  INTERNAL: Track Button creation
// ─────────────────────────────────────────────

function _createTrackButton(storeName, productData) {
  const btn = document.createElement('button');
  btn.id = 'compareall-track-btn';
  btn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; margin-right: 6px;">
      <path d="M12 5v14M5 12h14" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
    <span>Rastrear con CompareAll</span>
  `;

  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '2147483647',
    background: 'linear-gradient(135deg, #4A90D9 0%, #7B61FF 100%)',
    color: '#ffffff',
    border: 'none',
    padding: '12px 20px',
    borderRadius: '12px',
    fontSize: '14px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(74, 144, 217, 0.4), 0 2px 8px rgba(0,0,0,0.2)',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    display: 'flex',
    alignItems: 'center',
    lineHeight: '1',
    userSelect: 'none',
    opacity: '0',
    transform: 'translateY(10px)'
  });

  // Animate in
  document.body.appendChild(btn);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      btn.style.opacity = '1';
      btn.style.transform = 'translateY(0)';
    });
  });

  // Hover effects
  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'translateY(-2px) scale(1.03)';
    btn.style.boxShadow = '0 8px 28px rgba(74, 144, 217, 0.5), 0 4px 12px rgba(0,0,0,0.25)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'translateY(0) scale(1)';
    btn.style.boxShadow = '0 6px 20px rgba(74, 144, 217, 0.4), 0 2px 8px rgba(0,0,0,0.2)';
  });

  // Click handler — send to service worker
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.innerHTML = '📊 Guardando...';
    btn.style.cursor = 'default';
    btn.style.background = '#1a4f8f';
    btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';

    chrome.runtime.sendMessage({
      action: 'PRICE_CAPTURED',
      store: storeName,
      ...productData,
      url: window.location.href
    }, (response) => {
      if (chrome.runtime.lastError) {
        btn.innerHTML = '⚠️ Error — Reintenta';
        btn.style.background = '#8f1a1a';
        btn.disabled = false;
        btn.style.cursor = 'pointer';
        return;
      }
      if (response?.success) {
        _transitionToTracked(btn);
      } else {
        btn.innerHTML = '⚠️ Error — Reintenta';
        btn.style.background = '#8f1a1a';
        btn.disabled = false;
        btn.style.cursor = 'pointer';
      }
    });
  });
}

function _showAlreadyTrackedBadge() {
  const badge = document.createElement('div');
  badge.id = 'compareall-track-btn';
  badge.innerHTML = '📊 Ya rastreado ✓';

  Object.assign(badge.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '2147483647',
    background: 'linear-gradient(135deg, #1a7f4b 0%, #2ecc71 100%)',
    color: '#ffffff',
    border: 'none',
    padding: '10px 18px',
    borderRadius: '12px',
    fontSize: '13px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontWeight: '600',
    boxShadow: '0 4px 14px rgba(46, 204, 113, 0.35), 0 2px 6px rgba(0,0,0,0.15)',
    cursor: 'default',
    userSelect: 'none',
    opacity: '0',
    transform: 'translateY(10px)',
    transition: 'all 0.3s ease'
  });

  document.body.appendChild(badge);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      badge.style.opacity = '1';
      badge.style.transform = 'translateY(0)';
    });
  });

  // Auto-hide after 5 seconds
  setTimeout(() => {
    badge.style.opacity = '0';
    badge.style.transform = 'translateY(10px)';
    setTimeout(() => badge.remove(), 400);
  }, 5000);
}

function _transitionToTracked(btn) {
  btn.innerHTML = '✅ Rastreado';
  btn.style.background = 'linear-gradient(135deg, #1a7f4b 0%, #2ecc71 100%)';
  btn.style.boxShadow = '0 4px 14px rgba(46, 204, 113, 0.35), 0 2px 6px rgba(0,0,0,0.15)';
  btn.style.cursor = 'default';

  setTimeout(() => {
    btn.style.opacity = '0';
    btn.style.transform = 'translateY(10px)';
    setTimeout(() => btn.remove(), 400);
  }, 4000);
}

// ─────────────────────────────────────────────
//  MESSAGE LISTENER: GET_PAGE_DATA (for popup)
// ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'GET_PAGE_DATA') {
    // Return the extracted product data if available
    if (window._compareAllPageData) {
      sendResponse(window._compareAllPageData);
    } else {
      sendResponse(null);
    }
  }
  return false; // synchronous response
});
