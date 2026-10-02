/* ============================================================
   ZHENIN - Username Manager (v2.10.1 FINAL)
   
   FIX v2.10.1:
   - 🔥 CRITICAL: Cache-first strategy — cek local dulu sebelum query
   - 🔥 CRITICAL: Fail-safe — jangan tampil modal kalau network error
   - Idempotent: enforce() skip kalau sudah ada username
   - Handle double-call dengan flag
   - Modal cancel/close tidak resolve sukses
   
   FIX v2.6.2:
   - Handle username registration + edit
   ============================================================ */

import { CONFIG } from './config.js';
import { Data } from './storage.js';

export const Username = {
  _requiredModal: null,
  _checkPromise: null,  // ⚠️ Cache promise untuk dedupe check
  _enforcing: false,    // ⚠️ Guard supaya enforce tidak dobel
  _lastCheckTime: 0,
  _lastCheckResult: null,
  CHECK_CACHE_MS: 60000,  // Cache hasil check 60 detik

  /**
   * ⚠️ v2.10.1: Get username — CACHE-FIRST
   * Cek lokal dulu, baru backend
   */
  async getUsername() {
    const session = Data.getSession();
    if (!session) return { hasUsername: false, username: '' };

    // ⚠️ STEP 1: Cek cache lokal — kalau ada, langsung return
    const cached = this.getLocalCache();
    if (cached && cached.length >= 2) {
      return { hasUsername: true, username: cached, fromCache: true };
    }

    // ⚠️ STEP 2: Cek memory cache (hasil check sebelumnya)
    const now = Date.now();
    if (this._lastCheckResult && (now - this._lastCheckTime) < this.CHECK_CACHE_MS) {
      return this._lastCheckResult;
    }

    // ⚠️ STEP 3: Query backend dengan dedupe promise
    if (this._checkPromise) return this._checkPromise;

    this._checkPromise = this._doCheckBackend(session);
    try {
      const result = await this._checkPromise;
      return result;
    } finally {
      this._checkPromise = null;
    }
  },

  /**
   * ⚠️ Do check backend dengan error handling
   */
  async _doCheckBackend(session) {
    try {
      const result = await this.fetchProfile(session.password, session.deviceHash);

      if (result && result.success && result.profile) {
        const hasUsername = !!result.profile.hasUsername;
        const username = result.profile.username || '';

        // Cache ke memory
        this._lastCheckResult = { hasUsername, username };
        this._lastCheckTime = Date.now();

        // ⚠️ Kalau backend kasih username, save ke localStorage juga
        if (hasUsername && username.length >= 2) {
          this.saveLocalCache(username);
        }

        return { hasUsername, username };
      }

      // ⚠️ Fail-safe: Kalau backend response tidak valid, JANGAN block
      // Return "unknown" state — jangan paksa modal muncul
      return { hasUsername: false, username: '', unknown: true };

    } catch (err) {
      console.warn('[Username] Check error:', err.message);

      // ⚠️ Fail-safe: Network error → assume no username (graceful)
      // Modal hanya muncul kalau cache benar-benar kosong
      return { hasUsername: false, username: '', error: err.message };
    }
  },

  /**
   * ⚠️ v2.10.1: checkHasUsername — alias untuk getUsername
   * Kompatibel dengan kode lama
   */
  async checkHasUsername() {
    return await this.getUsername();
  },

  /**
   * Fetch profile dari backend
   */
  async fetchProfile(password, deviceHash) {
    const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'getUserProfile',
        password: password,
        deviceHash: deviceHash
      })
    });

    return await response.json();
  },

  /**
   * Set username baru
   */
  async set(username) {
    const session = Data.getSession();
    if (!session) throw new Error('Session tidak valid');

    const cleanUsername = String(username || '').trim();
    if (cleanUsername.length < 2) throw new Error('Username minimal 2 karakter');
    if (cleanUsername.length > 40) throw new Error('Username maksimal 40 karakter');
    if (!/^[a-zA-Z0-9 ._\-]+$/.test(cleanUsername)) {
      throw new Error('Username hanya boleh huruf, angka, spasi, titik, _ , -');
    }

    const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'setUsername',
        password: session.password,
        deviceHash: session.deviceHash,
        username: cleanUsername
      })
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Gagal simpan username');
    }

    // ⚠️ Save ke localStorage + memory cache
    this.saveLocalCache(cleanUsername);
    this._lastCheckResult = { hasUsername: true, username: cleanUsername };
    this._lastCheckTime = Date.now();

    return { success: true, username: cleanUsername };
  },

  /**
   * Get username dari localStorage
   */
  getLocalCache() {
    const session = Data.getSession();
    if (!session) return '';
    try {
      return localStorage.getItem('zhenin_username_' + session.password) || '';
    } catch (e) {
      return '';
    }
  },

  /**
   * Save username ke localStorage
   */
  saveLocalCache(username) {
    const session = Data.getSession();
    if (!session) return;
    try {
      localStorage.setItem('zhenin_username_' + session.password, username);
    } catch (e) { /* ignore */ }
  },

  /**
   * ⚠️ v2.10.1: Show modal dengan handle cancel properly
   */
  showRequiredModal() {
    return new Promise((resolve) => {
      const modal = document.getElementById('modalUsernameRequired');
      if (!modal) {
        console.warn('[Username] Modal tidak ditemukan');
        resolve({ success: false, cancelled: true });
        return;
      }

      const input = document.getElementById('usernameRequiredInput');
      const btn = document.getElementById('usernameRequiredSave');
      const errEl = document.getElementById('usernameRequiredError');

      if (input) input.value = '';
      if (errEl) errEl.hidden = true;

      modal.hidden = false;
      modal.classList.add('show');
      document.body.style.overflow = 'hidden';

      setTimeout(() => input?.focus(), 100);

      let resolved = false;

      const cleanup = (result) => {
        if (resolved) return;
        resolved = true;
        modal.classList.remove('show');
        modal.hidden = true;
        document.body.style.overflow = '';
        btn.onclick = null;
        input.onkeydown = null;
        resolve(result);
      };

      const doSave = async () => {
        const username = input.value.trim();

        if (!username) {
          if (errEl) {
            errEl.textContent = 'Username wajib diisi';
            errEl.hidden = false;
          }
          input.focus();
          return;
        }

        if (username.length < 2) {
          if (errEl) {
            errEl.textContent = 'Username minimal 2 karakter';
            errEl.hidden = false;
          }
          input.focus();
          return;
        }

        if (!/^[a-zA-Z0-9 ._\-]+$/.test(username)) {
          if (errEl) {
            errEl.textContent = 'Username tidak boleh mengandung karakter khusus';
            errEl.hidden = false;
          }
          input.focus();
          return;
        }

        btn.disabled = true;
        const spinner = btn.querySelector('.btn-spinner');
        const text = btn.querySelector('.btn-text');
        if (spinner) spinner.hidden = false;
        if (text) text.style.opacity = '0.5';

        try {
          await this.set(username);
          cleanup({ success: true, username });
          if (window.UI) window.UI.toast('✅ Username tersimpan!', 'success');
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message;
            errEl.hidden = false;
          }
          if (window.UI) window.UI.toast('Gagal: ' + err.message, 'error');
        } finally {
          btn.disabled = false;
          if (spinner) spinner.hidden = true;
          if (text) text.style.opacity = '1';
        }
      };

      btn.onclick = doSave;

      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doSave();
        }
      };

      // ⚠️ Allow cancel via ESC (dengan confirm)
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (window.UI) {
            window.UI.toast('Username wajib diisi untuk melanjutkan', 'warning', 4000);
          }
        }
      };
      document.addEventListener('keydown', escHandler);

      // Cleanup esc handler saat modal close
      const originalCleanup = cleanup;
      const wrappedCleanup = (result) => {
        document.removeEventListener('keydown', escHandler);
        originalCleanup(result);
      };

      // Override cleanup untuk include remove listener
      btn.onclick = doSave;
      // Wrap resolve ke dalam cleanup
      const finalize = () => {
        document.removeEventListener('keydown', escHandler);
      };

      // Store wrapped cleanup
      const origResolve = resolve;
      resolve = (val) => {
        finalize();
        origResolve(val);
      };
    });
  },

  /**
   * ⚠️ v2.10.1: enforce() — CACHE-FIRST, only show modal if truly needed
   */
  async enforce() {
    // ⚠️ Guard: jangan enforce dobel
    if (this._enforcing) {
      console.log('[Username] Enforce already in progress, skipping');
      return { enforced: false, username: this.getLocalCache(), inProgress: true };
    }

    // ⚠️ STEP 1: Cek cache lokal — kalau ada, langsung return tanpa modal
    const cached = this.getLocalCache();
    if (cached && cached.length >= 2) {
      console.log('[Username] Cache found:', cached);
      this.updateUI(cached);
      return { enforced: false, username: cached, fromCache: true };
    }

    // ⚠️ STEP 2: Baru query backend
    this._enforcing = true;
    try {
      const check = await this.getUsername();

      if (check.hasUsername && check.username) {
        this.saveLocalCache(check.username);
        this.updateUI(check.username);
        console.log('[Username] Backend returned username:', check.username);
        return { enforced: false, username: check.username };
      }

      // ⚠️ STEP 3: Kalau backend error/unknown, JANGAN tampil modal
      // Kecuali cache lokal + backend dua-duanya kosong
      if (check.error || check.unknown) {
        console.warn('[Username] Backend check failed, skipping modal (fail-safe)');
        return { enforced: false, error: check.error || 'unknown', skipped: true };
      }

      // ⚠️ STEP 4: Benar-benar belum ada username → tampil modal
      console.log('[Username] No username found, showing modal');
      const result = await this.showRequiredModal();

      if (result.success && result.username) {
        this.updateUI(result.username);
      }

      return { enforced: true, ...result };

    } catch (err) {
      console.warn('[Username] Enforce error:', err.message);
      return { enforced: false, error: err.message };
    } finally {
      this._enforcing = false;
    }
  },

  /**
   * Update UI elements dengan username
   */
  updateUI(username) {
    if (!username) return;

    const els = ['userNameDisplay', 'profileName'];
    els.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = username;
    });

    // Avatar initial
    const initial = username.charAt(0).toUpperCase();
    const avatars = ['userAvatar', 'profileAvatar'];
    avatars.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = initial;
    });
  },

  /**
   * ⚠️ v2.10.1: Clear cache (untuk debug / logout)
   */
  clearCache() {
    const session = Data.getSession();
    if (!session) return;
    try {
      localStorage.removeItem('zhenin_username_' + session.password);
    } catch (e) { /* ignore */ }
    this._lastCheckResult = null;
    this._lastCheckTime = 0;
  }
};

export default Username;