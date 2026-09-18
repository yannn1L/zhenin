/* ============================================================
   ZHENIN - Profile Manager (v2.3.0)
   Handle profile screen, edit, save, dan auto-fill
   ============================================================ */

import { CONFIG } from './config.js';
import { Data, StorageMonitor } from './storage.js';

/* ============================================================
   PROFILE MANAGER
   ============================================================ */
export const Profile = {
  _saveTimer: null,
  _lastSaved: null,
  
  /**
   * Initialize profile screen
   */
  init() {
    this.renderStats();
    this.renderFields();
    this.renderStorageWidget();
    this.bindEvents();
    this.updateHeaderUI();
  },
  
  /**
   * Render profile fields berdasarkan CONFIG.PROFILE_FIELDS
   */
  renderFields() {
    const container = document.getElementById('profileFieldsContainer');
    if (!container) return;
    
    const profile = Data.getProfile();
    
    container.innerHTML = CONFIG.PROFILE_FIELDS.map(field => {
      const value = profile[field.key] || '';
      const required = field.required ? 'required' : '';
      const requiredMark = field.required ? ' required' : '';
      
      return `
        <div class="form-field">
          <label class="form-label${requiredMark}" for="profile_${field.key}">${escapeHtml(field.label)}</label>
          <input
            type="text"
            id="profile_${field.key}"
            class="form-input"
            data-profile-key="${field.key}"
            placeholder="${escapeHtml(field.placeholder)}"
            value="${escapeHtml(value)}"
            maxlength="${field.maxLength || 100}"
            autocomplete="off"
            spellcheck="false"
            ${required}>
        </div>
      `;
    }).join('');
    
    // Bind input listeners
    container.querySelectorAll('[data-profile-key]').forEach(input => {
      input.addEventListener('input', () => this.onFieldChange());
      input.addEventListener('blur', () => this.saveNow());
    });
  },
  
  /**
   * Handle perubahan field (debounced)
   */
  onFieldChange() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this.saveNow();
    }, CONFIG.TIMING.PROFILE_DEBOUNCE_MS);
  },
  
  /**
   * Save profile ke localStorage
   */
  saveNow() {
    const container = document.getElementById('profileFieldsContainer');
    if (!container) return;
    
    const inputs = container.querySelectorAll('[data-profile-key]');
    const profile = {};
    
    inputs.forEach(input => {
      profile[input.dataset.profileKey] = input.value.trim();
    });
    
    // Skip save kalau data sama
    const current = Data.getProfile();
    const isSame = CONFIG.PROFILE_FIELDS.every(f =>
      (current[f.key] || '') === (profile[f.key] || '')
    );
    
    if (isSame) return;
    
    Data.saveProfile(profile);
    this._lastSaved = Date.now();
    
    // Update header
    this.updateHeaderUI();
    
    // Update stats
    this.renderStats();
  },
  
  /**
   * Update header UI (avatar + name)
   */
  updateHeaderUI() {
    const initials = Data.getProfileInitials();
    const profile = Data.getProfile();
    const displayName = profile.nama || 'User';
    
    // Home header avatar
    const userAvatar = document.getElementById('userAvatar');
    if (userAvatar) userAvatar.textContent = initials;
    
    // Home header name
    const userNameDisplay = document.getElementById('userNameDisplay');
    if (userNameDisplay) userNameDisplay.textContent = displayName;
    
    // Profile screen avatar
    const profileAvatar = document.getElementById('profileAvatar');
    if (profileAvatar) profileAvatar.textContent = initials;
    
    // Profile screen name
    const profileName = document.getElementById('profileName');
    if (profileName) profileName.textContent = displayName;
  },
  
  /**
   * Render stats di profile screen
   */
  renderStats() {
    const session = Data.getSession();
    const token = session?.token || 0;
    const totalDocs = Data.getLP().length + Data.getAskep().length;
    
    const statToken = document.getElementById('statToken');
    if (statToken) statToken.textContent = token;
    
    const statDocs = document.getElementById('statDocs');
    if (statDocs) statDocs.textContent = totalDocs;
    
    // Profile code
    const profileCode = document.getElementById('profileCode');
    if (profileCode && session) {
      profileCode.textContent = session.password || '';
    }
  },
  
  /**
   * Render storage widget
   */
  renderStorageWidget() {
    const container = document.getElementById('storageWidget');
    if (!container) return;
    
    const stats = StorageMonitor.getStats();
    const pct = StorageMonitor.getUsagePct();
    const level = StorageMonitor.getLevel();
    
    let barClass = '';
    if (level === 'critical') barClass = 'critical';
    else if (level === 'warning') barClass = 'warning';
    
    container.innerHTML = `
      <div class="storage-widget-header">
        <div class="storage-widget-icon">💾</div>
        <div class="storage-widget-title">Penyimpanan</div>
        <div class="storage-widget-pct ${barClass}">${Math.round(pct)}%</div>
      </div>
      <div class="storage-widget-bar">
        <div class="storage-widget-fill ${barClass}" style="width:${pct}%"></div>
      </div>
      <div class="storage-widget-info">
        ${StorageMonitor.format(stats.total)} / ${CONFIG.STORAGE_MONITOR.LIMIT_MB} MB
      </div>
      <div class="storage-widget-detail">
        <span>📄 LP: ${StorageMonitor.format(stats.lp)}</span>
        <span>📋 Askep: ${StorageMonitor.format(stats.askep)}</span>
        <span>💾 Backup: ${StorageMonitor.format(stats.backup)}</span>
      </div>
    `;
  },
  
  /**
   * Bind events di profile screen
   */
  bindEvents() {
    // Handled by app.js
  },
  
  /**
   * Reset form (untuk testing)
   */
  resetForm() {
    const container = document.getElementById('profileFieldsContainer');
    if (!container) return;
    
    container.querySelectorAll('[data-profile-key]').forEach(input => {
      input.value = '';
    });
    
    this.saveNow();
  }
};

/* ============================================================
   HELPERS
   ============================================================ */
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default Profile;