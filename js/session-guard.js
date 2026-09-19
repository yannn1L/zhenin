/* ============================================================
   ZHENIN - Session Guard (v2.3.0)
   Auto-logout jika akun dihapus/revoked/device mismatch
   ============================================================ */

import { CONFIG } from './config.js';
import { Data } from './storage.js';
import { Auth } from './auth.js';

/* ============================================================
   SESSION GUARD
   ============================================================ */
export const SessionGuard = {
  _intervalId: null,
  _checking: false,
  _onLogout: null,
  CHECK_INTERVAL_MS: 5 * 60 * 1000, // 5 menit
  
  /**
   * Initialize guard dengan callback logout
   */
  init(onLogout) {
    this._onLogout = onLogout;
    this.startPeriodicCheck();
    this.bindEvents();
  },
  
  /**
   * Bind ke events untuk immediate check
   */
  bindEvents() {
    // Check saat app kembali fokus (buka dari background)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Auth.isLoggedIn()) {
        this.check('visibility');
      }
    });
    
    // Check saat window focus
    window.addEventListener('focus', () => {
      if (Auth.isLoggedIn()) {
        this.check('focus');
      }
    });
    
    // Check saat tab menjadi online kembali
    window.addEventListener('online', () => {
      if (Auth.isLoggedIn()) {
        this.check('online');
      }
    });
  },
  
  /**
   * Start periodic check
   */
  startPeriodicCheck() {
    this.stopPeriodicCheck();
    this._intervalId = setInterval(() => {
      if (Auth.isLoggedIn()) {
        this.check('periodic');
      }
    }, this.CHECK_INTERVAL_MS);
  },
  
  /**
   * Stop periodic check
   */
  stopPeriodicCheck() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  },
  
  /**
   * Main check function
   * @param {string} source - 'periodic' | 'visibility' | 'focus' | 'online' | 'manual'
   */
  async check(source = 'manual') {
    if (this._checking) return { success: true, reason: 'in_progress' };
    if (!Auth.isLoggedIn()) return { success: false, reason: 'not_logged_in' };
    
    this._checking = true;
    
    try {
      const session = Data.getSession();
      if (!session || !session.password || !session.deviceHash) {
        this._forceLogout('Session data tidak valid');
        return { success: false, reason: 'invalid_session_data' };
      }
      
      // Skip kalau offline
      if (!navigator.onLine) {
        return { success: true, reason: 'offline' };
      }
      
      // Call backend validate
      const result = await this.callValidate(session.password, session.deviceHash);
      
      if (result.valid) {
        // Update token kalau berubah
        if (typeof result.token === 'number' && result.token !== session.token) {
          session.token = result.token;
          session.lastActive = Date.now();
          Data.saveSession(session);
        }
        return { success: true };
      }
      
      // Handle invalid
      this.handleInvalidReason(result.reason);
      
      return { success: false, reason: result.reason };
      
    } catch (err) {
      // Network error → jangan logout (silent fail)
      console.warn('[SessionGuard] Check error:', err.message);
      return { success: true, reason: 'network_error' };
    } finally {
      this._checking = false;
    }
  },
  
  /**
   * Call backend validate
   */
  async callValidate(password, deviceHash) {
    if (!CONFIG.APPS_SCRIPT_URL) {
      return { valid: true }; // Skip kalau belum dikonfigurasi
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
      
      if (!response.ok) {
        return { valid: true }; // Assume valid on network error
      }
      
      return await response.json();
    } catch (e) {
      clearTimeout(timeoutId);
      return { valid: true }; // Assume valid on error
    }
  },
  
  /**
   * Handle invalid reason dari backend
   */
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
  
  /**
   * Force logout dengan notifikasi
   */
  _forceLogout(message, title = 'Session Berakhir', icon = '⚠️') {
    console.log('[SessionGuard] Force logout:', title);
    
    // Call external logout handler
    if (typeof this._onLogout === 'function') {
      this._onLogout({ title, message, icon });
    }
  },
  
  /**
   * Manual check (dipanggil sebelum critical action)
   */
  async checkNow() {
    return await this.check('manual');
  },
  
  /**
   * Destroy
   */
  destroy() {
    this.stopPeriodicCheck();
    this._onLogout = null;
  }
};

export default SessionGuard;