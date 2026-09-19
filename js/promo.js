/* ============================================================
   ZHENIN - Promo Banner (v2.3.0)
   Fetch promo dari backend, dismiss dengan cache
   ============================================================ */

import { CONFIG } from './config.js';
import { Data } from './storage.js';

export const Promo = {
  _loaded: false,
  
  /**
   * Load promo dari backend
   */
  async load() {
    if (this._loaded) return;
    
    const banner = document.getElementById('promoBanner');
    if (!banner) return;
    
    // Hide by default
    banner.hidden = true;
    
    // Check dismissed
    if (Data.isPromoDismissed()) {
      return;
    }
    
    // Try cache dulu
    let promo = Data.getPromoCache();
    
    // Kalau tidak ada cache, fetch dari backend
    if (!promo) {
      try {
        promo = await this.fetchFromBackend();
        if (promo) Data.savePromoCache(promo);
      } catch (e) {
        console.warn('[Promo] Fetch error:', e.message);
        return;
      }
    }
    
    // Render
    if (promo && promo.active) {
      this.render(promo);
    }
    
    this._loaded = true;
  },
  
  /**
   * Fetch dari backend
   */
  async fetchFromBackend() {
    if (!CONFIG.APPS_SCRIPT_URL) return null;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    try {
      const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'getPromo' }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) return null;
      const result = await response.json();
      return result;
    } catch (e) {
      clearTimeout(timeoutId);
      return null;
    }
  },
  
  /**
   * Render banner
   */
  render(promo) {
    const banner = document.getElementById('promoBanner');
    const titleEl = document.getElementById('promoTitle');
    const descEl = document.getElementById('promoDesc');
    const iconEl = document.getElementById('promoIcon');
    
    if (!banner) return;
    
    if (titleEl) titleEl.textContent = 'PROMO SPESIAL';
    if (descEl) descEl.textContent = promo.text || '';
    if (iconEl) iconEl.textContent = promo.icon || '🎉';
    
    // Color variant
    banner.setAttribute('data-color', promo.color || 'purple');
    
    banner.hidden = false;
  },
  
  /**
   * Dismiss banner
   */
  dismiss() {
    Data.setPromoDismissed();
    const banner = document.getElementById('promoBanner');
    if (banner) banner.hidden = true;
  }
};

export default Promo;