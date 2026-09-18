/* ============================================================
   ZHENIN - Token Manager (v2.3.0)
   Handle token display, decrement, sync
   ============================================================ */

import { CONFIG } from './config.js';
import { Data } from './storage.js';

/* ============================================================
   TOKEN MANAGER
   ============================================================ */
export const TokenManager = {
  _lastToken: null,
  
  /**
   * Get current token
   */
  getToken() {
    const session = Data.getSession();
    return session?.token || 0;
  },
  
  /**
   * Check apakah cukup
   */
  hasEnough(amount = 1) {
    return this.getToken() >= amount;
  },
  
  /**
   * Check apakah perlu warning (token < threshold)
   */
  shouldWarn() {
    return this.getToken() < CONFIG.LIMITS.TOKEN_WARNING_THRESHOLD;
  },
  
  /**
   * Update token setelah AI generation
   */
  updateFromResponse(remainingToken) {
    if (typeof remainingToken !== 'number') return;
    
    const session = Data.getSession();
    if (!session) return;
    
    session.token = Math.max(0, remainingToken);
    session.lastActive = Date.now();
    Data.saveSession(session);
    
    this.refreshAllUI();
  },
  
  /**
   * Refresh semua UI yang menampilkan token
   */
  refreshAllUI() {
    const token = this.getToken();
    
    // Skip kalau sama
    if (this._lastToken === token) return;
    this._lastToken = token;
    
    // Home token card
    const tokenCount = document.getElementById('tokenCount');
    if (tokenCount) {
      this.animateNumber(tokenCount, token);
    }
    
    // AI form cost info
    const costRemaining = document.getElementById('costRemaining');
    if (costRemaining) costRemaining.textContent = token;
    
    // Profile stat
    const statToken = document.getElementById('statToken');
    if (statToken) statToken.textContent = token;
    
    // Token warning (home)
    const warning = document.getElementById('tokenWarning');
    if (warning) {
      warning.hidden = token >= CONFIG.LIMITS.TOKEN_WARNING_THRESHOLD;
    }
    
    // Token status badge
    const status = document.getElementById('tokenStatus');
    if (status) {
      if (token === 0) {
        status.textContent = 'Habis';
        status.style.background = 'rgba(248, 113, 113, 0.15)';
        status.style.color = 'var(--z-error)';
        status.style.borderColor = 'rgba(248, 113, 113, 0.3)';
      } else if (token < CONFIG.LIMITS.TOKEN_WARNING_THRESHOLD) {
        status.textContent = 'Rendah';
        status.style.background = 'rgba(251, 191, 36, 0.15)';
        status.style.color = 'var(--z-warning)';
        status.style.borderColor = 'rgba(251, 191, 36, 0.3)';
      } else {
        status.textContent = 'Aktif';
        status.style.background = '';
        status.style.color = '';
        status.style.borderColor = '';
      }
    }
  },
  
  /**
   * Animate number change
   */
  animateNumber(el, target) {
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;
    
    const diff = target - current;
    const steps = Math.min(Math.abs(diff), 10);
    if (steps === 0) {
      el.textContent = target;
      return;
    }
    
    let step = 0;
    const interval = setInterval(() => {
      step++;
      el.textContent = Math.round(current + (diff * step / steps));
      if (step >= steps) {
        el.textContent = target;
        clearInterval(interval);
      }
    }, 30);
  },
  
  /**
   * Reset cache (untuk force refresh)
   */
  reset() {
    this._lastToken = null;
  }
};

export default TokenManager;