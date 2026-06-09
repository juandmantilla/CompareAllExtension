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
            const price = item.offers?.price || item.offers?.[0]?.price;
            return {
              name: item.name || null,
              price: price ? parseFloat(String(price).replace(/[^\d.]/g, '')) : null,
              image: item.image?.[0] || item.image || null,
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
