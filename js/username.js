/* ============================================================
   ZHENIN - Username Manager (v2.6.2)
   Handle username registration + edit
   ============================================================ */

import { CONFIG } from './config.js';
import { Data } from './storage.js';

export const Username = {
  _requiredModal: null,
  
  /**
   * Check apakah user sudah punya username
   */
  async checkHasUsername() {
    const session = Data.getSession();
    if (!session) return { hasUsername: false, username: '' };
    
    try {
      const result = await this.fetchProfile(session.password, session.deviceHash);
      if (result.success && result.profile) {
        return {
          hasUsername: result.profile.hasUsername,
          username: result.profile.username || ''
        };
      }
    } catch (err) {
      console.warn('[Username] Check error:', err.message);
    }
    
    return { hasUsername: false, username: '' };
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
    
    // Save ke localStorage juga (cache)
    this.saveLocalCache(cleanUsername);
    
    return { success: true, username: cleanUsername };
  },
  
  /**
   * Get username dari localStorage (cache)
   */
  getLocalCache() {
    const session = Data.getSession();
    if (!session) return '';
    return localStorage.getItem('zhenin_username_' + session.password) || '';
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
   * Show modal wajib isi username (first time)
   */
  showRequiredModal() {
    return new Promise((resolve) => {
      const modal = document.getElementById('modalUsernameRequired');
      if (!modal) {
        console.warn('[Username] Modal tidak ditemukan');
        resolve({ success: false });
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
      
      const cleanup = () => {
        modal.classList.remove('show');
        modal.hidden = true;
        document.body.style.overflow = '';
        btn.onclick = null;
        input.onkeydown = null;
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
          cleanup();
          if (window.UI) window.UI.toast('✅ Username tersimpan!', 'success');
          resolve({ success: true, username });
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
    });
  },
  
  /**
   * Check first login + show modal kalau belum ada username
   */
  async enforce() {
    try {
      const check = await this.checkHasUsername();
      
      if (check.hasUsername) {
        this.saveLocalCache(check.username);
        return { enforced: false, username: check.username };
      }
      
      // Show modal wajib
      const result = await this.showRequiredModal();
      return { enforced: true, ...result };
    } catch (err) {
      console.warn('[Username] Enforce error:', err.message);
      return { enforced: false, error: err.message };
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
  }
};

export default Username;