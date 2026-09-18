/* ============================================================
   ZHENIN - Auth Module
   Login, device fingerprint, session, AI calls
   ============================================================ */

import { CONFIG } from './config.js';
import { Data, Storage } from './storage.js';

/* ============================================================
   DEVICE FINGERPRINT
   ============================================================ */
export const DeviceFingerprint = {
  /**
   * Generate device hash (async)
   */
  async generate() {
    const components = [];

    // Browser info
    components.push('ua:' + navigator.userAgent);
    components.push('lang:' + (navigator.language || 'unknown'));
    components.push('platform:' + (navigator.platform || 'unknown'));

    // Screen
    components.push('screen:' + screen.width + 'x' + screen.height + 'x' + screen.colorDepth);

    // Timezone
    try {
      components.push('tz:' + Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch (e) { /* ignore */ }

    // Hardware
    components.push('cpu:' + (navigator.hardwareConcurrency || 0));
    components.push('mem:' + (navigator.deviceMemory || 0));
    components.push('touch:' + (navigator.maxTouchPoints || 0));

    // Canvas fingerprint
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px "Arial"';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('Zhenin!@#$%', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('Zhenin!@#$%', 4, 17);
      components.push('canvas:' + canvas.toDataURL().slice(-80));
    } catch (e) { /* ignore */ }

    // WebGL fingerprint
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      if (gl) {
        const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbgInfo) {
          components.push('glr:' + gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL));
          components.push('glv:' + gl.getParameter(dbgInfo.UNMASKED_VENDOR_WEBGL));
        }
      }
    } catch (e) { /* ignore */ }

    // Font detection
    try {
      const testFonts = ['Arial', 'Courier', 'Times', 'Helvetica', 'Georgia', 'Verdana', 'Comic Sans MS'];
      const fontSupport = testFonts.map(font => {
        const el = document.createElement('span');
        el.style.fontFamily = font;
        el.style.fontSize = '72px';
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        el.style.visibility = 'hidden';
        el.textContent = 'mmmwwwiiilll';
        document.body.appendChild(el);
        const w1 = el.offsetWidth;
        el.style.fontFamily = 'monospace';
        const w2 = el.offsetWidth;
        document.body.removeChild(el);
        return w1 !== w2 ? '1' : '0';
      }).join('');
      components.push('fonts:' + fontSupport);
    } catch (e) { /* ignore */ }

    const combined = components.join('|||');
    return await sha256(combined);
  },

  /**
   * Get or generate device hash (cached)
   */
  async getOrCreate() {
    let hash = Data.getDeviceHash();
    if (!hash) {
      hash = await this.generate();
      Data.saveDeviceHash(hash);
    }
    return hash;
  },

  /**
   * Verify device hash masih valid
   */
  async verify() {
    const stored = Data.getDeviceHash();
    if (!stored) return { valid: false, reason: 'No device hash' };

    const current = await this.generate();
    if (stored === current) {
      return { valid: true, confidence: 'high' };
    }

    // Partial match (toleran kalau ada update browser)
    const matchRatio = this.partialMatch(stored, current);
    if (matchRatio > 0.7) {
      // Update stored hash
      Data.saveDeviceHash(current);
      return { valid: true, confidence: 'medium', matchRatio };
    }

    return { valid: false, confidence: 'low', matchRatio };
  },

  /**
   * Partial match ratio
   */
  partialMatch(a, b) {
    if (!a || !b) return 0;
    const len = Math.min(a.length, b.length);
    let matches = 0;
    for (let i = 0; i < len; i++) {
      if (a[i] === b[i]) matches++;
    }
    return matches / Math.max(a.length, b.length);
  }
};

/* ============================================================
   AUTH MODULE
   ============================================================ */
export const Auth = {
  /**
   * Login dengan password
   */
  async login(password) {
    if (!password || !password.trim()) {
      return { success: false, error: 'Password tidak boleh kosong' };
    }

    const cleanPassword = password.trim().toUpperCase();

    // Validasi format dasar
    if (!/^[A-Z]+-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cleanPassword)) {
      return {
        success: false,
        error: 'Format password tidak valid. Contoh: USER-XXXX-XXXX'
      };
    }

    // Cek connection
    if (!CONFIG.APPS_SCRIPT_URL) {
      return {
        success: false,
        error: 'Backend belum dikonfigurasi. Hubungi admin.'
      };
    }

    // Generate device hash
    let deviceHash;
    try {
      deviceHash = await DeviceFingerprint.getOrCreate();
    } catch (e) {
      return { success: false, error: 'Gagal generate device fingerprint' };
    }

    // Call backend
    try {
      const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'login',
          password: cleanPassword,
          deviceHash
        })
      });

      if (!response.ok) {
        throw new Error('Network error: ' + response.status);
      }

      const result = await response.json();

      if (!result.valid) {
        return {
          success: false,
          error: result.message || 'Login gagal'
        };
      }

      // Save session
      const session = {
        password: cleanPassword,
        deviceHash,
        token: result.token || 0,
        loginAt: Date.now(),
        expiresAt: Date.now() + CONFIG.TIMING.SESSION_MAX_AGE_MS,
        firstUse: !!result.firstUse,
        lastActive: Date.now()
      };

      Data.saveSession(session);

      return {
        success: true,
        session,
        firstUse: !!result.firstUse,
        message: result.message
      };
    } catch (err) {
      console.error('Login error:', err);
      return {
        success: false,
        error: 'Koneksi gagal: ' + err.message
      };
    }
  },

  /**
   * Logout
   */
  logout() {
    Data.clearSession();
    return { success: true };
  },

  /**
   * Check if logged in
   */
  isLoggedIn() {
    const session = Data.getSession();
    return !!(session && session.password && session.deviceHash);
  },

  /**
   * Get current session
   */
  getSession() {
    return Data.getSession();
  },

  /**
   * Update session token
   */
  updateToken(newToken) {
    const session = Data.getSession();
    if (!session) return false;
    session.token = newToken;
    session.lastActive = Date.now();
    Data.saveSession(session);
    return true;
  },

  /**
   * Refresh session dari backend (check token masih valid)
   */
  async refreshSession() {
    const session = Data.getSession();
    if (!session) return { success: false, error: 'No session' };

    try {
      const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'refresh',
          password: session.password,
          deviceHash: session.deviceHash
        })
      });

      const result = await response.json();

      if (result.valid) {
        session.token = result.token;
        session.lastActive = Date.now();
        Data.saveSession(session);
        return { success: true, session };
      } else {
        // Session invalid
        Data.clearSession();
        return { success: false, error: result.message };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Check apakah session masih valid
   */
  async verify() {
    if (!this.isLoggedIn()) return false;

    // Cek expiry
    const session = Data.getSession();
    if (session.expiresAt && Date.now() > session.expiresAt) {
      Data.clearSession();
      return false;
    }

    return true;
  },

  /**
   * Check apakah user punya cukup token
   */
  hasEnoughToken(amount = 1) {
    const session = Data.getSession();
    if (!session) return false;
    return (session.token || 0) >= amount;
  },

  /**
   * Decrement token locally
   */
  decrementToken(amount = 1) {
    const session = Data.getSession();
    if (!session) return false;
    session.token = Math.max(0, (session.token || 0) - amount);
    Data.saveSession(session);
    return session.token;
  }
};

/* ============================================================
   CONTACT ADMIN
   ============================================================ */
export const ContactAdmin = {
  getWAUrl(message = '') {
    const phone = CONFIG.CONTACT.wa;
    const text = message || `Halo ${CONFIG.CONTACT.name}, saya ingin bertanya tentang Zhenin.`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  },

  openWA(message = '') {
    const url = this.getWAUrl(message);
    window.open(url, '_blank', 'noopener');
  }
};

/* ============================================================
   HELPERS
   ============================================================ */
async function sha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */
export default {
  DeviceFingerprint,
  Auth,
  ContactAdmin
};