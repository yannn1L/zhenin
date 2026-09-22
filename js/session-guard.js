/* ============================================================
   ZHENIN - Session Guard (v2.7.1)
   Auto-logout dengan response validation
   ============================================================ */

import { CONFIG } from './config.js';
import { Data } from './storage.js';
import { Auth } from './auth.js';

export const SessionGuard = {
  _intervalId: null,
  _checking: false,
  _onLogout: null,
  CHECK_INTERVAL_MS: 5 * 60 * 1000,
  
  init(onLogout) {
    this._onLogout = onLogout;
    this.startPeriodicCheck();
    this.bindEvents();
  },
  
  bindEvents() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Auth.isLoggedIn()) {
        this.check('visibility');
      }
    });
    
    window.addEventListener('focus', () => {
      if (Auth.isLoggedIn()) {
        this.check('focus');
      }
    });
    
    window.addEventListener('online', () => {
      if (Auth.isLoggedIn()) {
        this.check('online');
      }
    });
  },
  
  startPeriodicCheck() {
    this.stopPeriodicCheck();
    this._intervalId = setInterval(() => {
      if (Auth.isLoggedIn()) {
        this.check('periodic');
      }
    }, this.CHECK_INTERVAL_MS);
  },
  
  stopPeriodicCheck() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  },
  
  async check(source = 'manual') {
  if (this._checking) return { success: false, reason: 'in_progress' };
  if (!Auth.isLoggedIn()) return { success: false, reason: 'not_logged_in' };
  
  this._checking = true;
  
  try {
    const session = Data.getSession();
    if (!session || !session.password || !session.deviceHash) {
      this._forceLogout('Session data tidak valid');
      return { success: false, reason: 'invalid_session_data' };
    }
    
    if (!navigator.onLine) {
      return { success: true, reason: 'offline' };
    }
    
    const result = await this.callValidate(session.password, session.deviceHash);
    
    if (result.valid) {
      if (typeof result.token === 'number' && result.token !== session.token) {
        session.token = result.token;
        session.lastActive = Date.now();
        Data.saveSession(session);
      }
      return { success: true };
    }
    
    this.handleInvalidReason(result.reason);
    return { success: false, reason: result.reason };
    
  } catch (err) {
    console.warn('[SessionGuard] Check error:', err.message);
    return { success: true, reason: 'network_error' };
  } finally {
    this._checking = false;
  }
},
  
  /**
   * ⚠️ FIXED: Validate response dengan shape checking
   */
  async callValidate(password, deviceHash) {
    if (!CONFIG.APPS_SCRIPT_URL) {
      return { valid: true };
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    try {
      const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'validate',
          password,
          deviceHash
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Network error → assume valid (fail-open)
      if (!response.ok) {
        return { valid: true, reason: 'http_error' };
      }
      
      // Parse JSON safely
      let result;
      try {
        result = await response.json();
      } catch (parseErr) {
        console.warn('[SessionGuard] Parse error:', parseErr.message);
        return { valid: true, reason: 'parse_error' };
      }
      
      // Validate shape
      if (!result || typeof result !== 'object') {
        return { valid: true, reason: 'invalid_shape' };
      }
      
      // ⚠️ CRITICAL: Hanya trigger logout kalau reason EKSPLISIT
      if (result.valid === false) {
        const validReasons = ['not_found', 'revoked', 'device_mismatch'];
        if (validReasons.includes(result.reason)) {
          return result; // Trigger logout
        }
        // Reason tidak dikenal → assume valid
        console.warn('[SessionGuard] Unknown reason:', result.reason);
        return { valid: true, reason: 'unknown_reason' };
      }
      
      // `valid` bukan false → assume valid
      return { valid: true };
      
    } catch (e) {
      clearTimeout(timeoutId);
      // Exception (network, abort, dll) → assume valid
      return { valid: true, reason: 'exception' };
    }
  },
  
  handleInvalidReason(reason) {
    const messages = {
      'not_found': {
        title: 'Akun Tidak Ditemukan',
        desc: 'Akun Anda telah dihapus oleh admin. Hubungi admin untuk info lebih lanjut.',
        icon: '🚫'
      },
      'revoked': {
        title: 'Akun Dicabut',
        desc: 'Akun Anda telah dicabut oleh admin. Hubungi admin untuk info lebih lanjut.',
        icon: '🚫'
      },
      'device_mismatch': {
        title: 'Device Direset',
        desc: 'Device Anda telah di-reset oleh admin. Silakan login kembali.',
        icon: '📱'
      },
      'missing_data': {
        title: 'Session Tidak Valid',
        desc: 'Data session Anda tidak lengkap. Silakan login kembali.',
        icon: '⚠️'
      }
    };
    
    const info = messages[reason] || {
      title: 'Session Berakhir',
      desc: 'Session Anda tidak valid lagi. Silakan login kembali.',
      icon: '⚠️'
    };
    
    this._forceLogout(info.desc, info.title, info.icon);
  },
  
  _forceLogout(message, title = 'Session Berakhir', icon = '⚠️') {
    console.log('[SessionGuard] Force logout:', title);
    
    if (typeof this._onLogout === 'function') {
      this._onLogout({ title, message, icon });
    }
  },
  
  async checkNow() {
    return await this.check('manual');
  },
  
  destroy() {
    this.stopPeriodicCheck();
    this._onLogout = null;
  }
};

export default SessionGuard;