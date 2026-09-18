/* ============================================================
   ZHENIN - Storage Module (UPDATED Sprint 2B)
   LocalStorage wrapper + Backup + Monitor + Admin Session
   ============================================================ */

import { CONFIG } from './config.js';

/* ============================================================
   BASE STORAGE
   ============================================================ */
export const Storage = {
  /**
   * Save data ke localStorage dengan error handling
   */
  save(key, data) {
    try {
      const json = JSON.stringify(data);
      localStorage.setItem(key, json);
      StorageMonitor.invalidateCache();
      return { success: true, size: json.length };
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        return {
          success: false,
          error: 'QUOTA_EXCEEDED',
          message: 'Penyimpanan penuh. Export data lalu bersihkan.'
        };
      }
      return {
        success: false,
        error: 'UNKNOWN',
        message: e.message
      };
    }
  },

  /**
   * Load data dari localStorage
   */
  load(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      const parsed = JSON.parse(raw);
      return parsed === null ? fallback : parsed;
    } catch (e) {
      console.warn('Storage.load parse error:', key, e);
      return fallback;
    }
  },

  /**
   * Remove item
   */
  remove(key) {
    try {
      localStorage.removeItem(key);
      StorageMonitor.invalidateCache();
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * Cek apakah key ada
   */
  has(key) {
    return localStorage.getItem(key) !== null;
  },

  /**
   * Get size (bytes) dari value
   */
  sizeOf(key) {
    const raw = localStorage.getItem(key);
    return raw ? new Blob([raw]).size : 0;
  },

  /**
   * Get all keys dengan prefix (FIX: guard null key)
   */
  keys(prefix = '') {
    const result = [];
    const len = localStorage.length;
    for (let i = 0; i < len; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) result.push(k);
    }
    return result;
  },

  /**
   * Clear all dengan prefix
   */
  clearPrefix(prefix) {
    this.keys(prefix).forEach(k => this.remove(k));
  }
};

/* ============================================================
   DATA ACCESS
   ============================================================ */
export const Data = {
  // ===== LP =====
  getLP() {
    const arr = Storage.load(CONFIG.STORAGE.LP, []);
    return Array.isArray(arr) ? arr.filter(isValidDoc) : [];
  },
  saveLP(list) {
    return Storage.save(CONFIG.STORAGE.LP, list);
  },

  // ===== Askep =====
  getAskep() {
    const arr = Storage.load(CONFIG.STORAGE.ASKEP, []);
    return Array.isArray(arr) ? arr.filter(isValidDoc) : [];
  },
  saveAskep(list) {
    return Storage.save(CONFIG.STORAGE.ASKEP, list);
  },

  // ===== Profile =====
  getProfile() {
    return Storage.load(CONFIG.STORAGE.PROFILE, {
      nama: '',
      nim: '',
      kelompok: '',
      tempatPraktik: '',
      periode: '',
      ci: ''
    });
  },
  saveProfile(profile) {
    return Storage.save(CONFIG.STORAGE.PROFILE, profile);
  },

  // ===== Layout =====
  getLayout() {
    return Storage.load(CONFIG.STORAGE.LAYOUT, {
      previewVisible: true,
      splitRatio: 0.5
    });
  },
  saveLayout(layout) {
    return Storage.save(CONFIG.STORAGE.LAYOUT, layout);
  },

  // ===== Session =====
  getSession() {
    const s = Storage.load(CONFIG.STORAGE.SESSION, null);
    if (!s) return null;
    if (s.expiresAt && Date.now() > s.expiresAt) {
      Storage.remove(CONFIG.STORAGE.SESSION);
      return null;
    }
    return s;
  },
  saveSession(session) {
    return Storage.save(CONFIG.STORAGE.SESSION, session);
  },
  clearSession() {
    return Storage.remove(CONFIG.STORAGE.SESSION);
  },

  // ===== Admin Session (NEW) =====
  getAdminSession() {
    const s = Storage.load(CONFIG.STORAGE.ADMIN_SESSION, null);
    if (!s) return null;
    if (s.expiresAt && Date.now() > s.expiresAt) {
      Storage.remove(CONFIG.STORAGE.ADMIN_SESSION);
      return null;
    }
    return s;
  },
  saveAdminSession(session) {
    return Storage.save(CONFIG.STORAGE.ADMIN_SESSION, session);
  },
  clearAdminSession() {
    return Storage.remove(CONFIG.STORAGE.ADMIN_SESSION);
  },

  // ===== Device Hash =====
  getDeviceHash() {
    return Storage.load(CONFIG.STORAGE.DEVICE, null);
  },
  saveDeviceHash(hash) {
    return Storage.save(CONFIG.STORAGE.DEVICE, hash);
  }
};

/* ============================================================
   STORAGE MONITOR (OPTIMIZED dengan cache 2 detik)
   ============================================================ */
export const StorageMonitor = {
  _cache: null,
  _cacheTime: 0,
  _cacheTTL: 2000,

  getStats() {
    const now = Date.now();
    if (this._cache && (now - this._cacheTime) < this._cacheTTL) {
      return this._cache;
    }

    const getSize = (key) => {
      const raw = localStorage.getItem(key);
      return raw ? new Blob([raw]).size : 0;
    };

    const stats = {
      lp: getSize(CONFIG.STORAGE.LP),
      askep: getSize(CONFIG.STORAGE.ASKEP),
      profile: getSize(CONFIG.STORAGE.PROFILE),
      backup: getSize(CONFIG.STORAGE.BACKUP),
      layout: getSize(CONFIG.STORAGE.LAYOUT),
      session: getSize(CONFIG.STORAGE.SESSION),
      device: getSize(CONFIG.STORAGE.DEVICE),
      promoDismissed: getSize(CONFIG.STORAGE.PROMO_DISMISSED),
      onboarded: getSize(CONFIG.STORAGE.ONBOARDED),
      adminSession: getSize(CONFIG.STORAGE.ADMIN_SESSION),
      total: 0
    };

    let total = 0;
    for (const k in stats) {
      if (k !== 'total') total += stats[k];
    }
    stats.total = total;

    this._cache = stats;
    this._cacheTime = now;
    return stats;
  },

  invalidateCache() {
    this._cache = null;
    this._cacheTime = 0;
  },

  getUsagePct() {
    const limitBytes = CONFIG.STORAGE_MONITOR.LIMIT_MB * 1024 * 1024;
    return Math.min(100, (this.getStats().total / limitBytes) * 100);
  },

  getLevel() {
    const pct = this.getUsagePct();
    if (pct >= CONFIG.STORAGE_MONITOR.CRIT_PCT) return 'critical';
    if (pct >= CONFIG.STORAGE_MONITOR.WARN_PCT) return 'warning';
    return 'normal';
  },

  format(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
};

/* ============================================================
   BACKUP MANAGEMENT
   ============================================================ */
export const Backup = {
  createSnapshot(label = 'Manual backup') {
    const lp = Data.getLP();
    const askep = Data.getAskep();
    const profile = Data.getProfile();
    const layout = Data.getLayout();
    const stats = StorageMonitor.getStats();

    return {
      id: generateId(),
      timestamp: Date.now(),
      label,
      version: CONFIG.APP_VERSION,
      stats: {
        lp: lp.length,
        askep: askep.length,
        bytes: stats.total
      },
      data: {
        lp: JSON.parse(JSON.stringify(lp)),
        askep: JSON.parse(JSON.stringify(askep)),
        profile: JSON.parse(JSON.stringify(profile)),
        layout: JSON.parse(JSON.stringify(layout))
      }
    };
  },

  getAll() {
    const arr = Storage.load(CONFIG.STORAGE.BACKUP, []);
    return Array.isArray(arr) ? arr : [];
  },

  save(snapshot) {
    const arr = this.getAll();
    arr.unshift(snapshot);
    const trimmed = arr.slice(0, CONFIG.BACKUP.MAX_SNAPSHOTS);
    return Storage.save(CONFIG.STORAGE.BACKUP, trimmed);
  },

  autoBackup() {
    try {
      const snapshot = this.createSnapshot('Auto backup');
      const result = this.save(snapshot);
      console.log('[Auto-backup]', new Date().toLocaleTimeString(), result.success ? 'OK' : 'FAILED');
      return result;
    } catch (e) {
      console.warn('Auto-backup failed:', e);
      return { success: false, error: e.message };
    }
  },

  restore(snapshotId) {
    const snapshots = this.getAll();
    const snap = snapshots.find(s => s.id === snapshotId);
    if (!snap) {
      return { success: false, error: 'Snapshot tidak ditemukan' };
    }

    try {
      if (snap.data.lp) Data.saveLP(snap.data.lp);
      if (snap.data.askep) Data.saveAskep(snap.data.askep);
      if (snap.data.profile) Data.saveProfile(snap.data.profile);
      if (snap.data.layout) Data.saveLayout(snap.data.layout);
      return { success: true, snapshot: snap };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  delete(snapshotId) {
    const arr = this.getAll().filter(s => s.id !== snapshotId);
    return Storage.save(CONFIG.STORAGE.BACKUP, arr);
  },

  getLatest() {
    const arr = this.getAll();
    return arr.length > 0 ? arr[0] : null;
  }
};

/* ============================================================
   EXPORT / IMPORT JSON
   ============================================================ */
export const ExportImport = {
  async exportJSON() {
    const data = {
      app: CONFIG.APP_NAME,
      version: CONFIG.APP_VERSION,
      exportedAt: new Date().toISOString(),
      profile: Data.getProfile(),
      layout: Data.getLayout(),
      lp: Data.getLP(),
      askep: Data.getAskep()
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const date = new Date().toISOString().slice(0, 10);
    const filename = `zhenin-backup-${date}.json`;

    if (window.saveAs) {
      window.saveAs(blob, filename);
      return { success: true, filename };
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { success: true, filename };
    }
  },

  async importJSON(file, mode = 'merge') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data || typeof data !== 'object') {
            throw new Error('File tidak valid');
          }

          const lpIn = Array.isArray(data.lp) ? data.lp : [];
          const askepIn = Array.isArray(data.askep) ? data.askep : [];
          const profileIn = data.profile || {};

          if (mode === 'replace') {
            Data.saveLP(lpIn);
            Data.saveAskep(askepIn);
            Data.saveProfile({ ...Data.getProfile(), ...profileIn });
          } else {
            const existingLP = Data.getLP();
            const existingAskep = Data.getAskep();
            const lpIds = new Set(existingLP.map(x => x.id));
            const askepIds = new Set(existingAskep.map(x => x.id));

            const mergedLP = [...existingLP, ...lpIn.filter(x => x.id && !lpIds.has(x.id))];
            const mergedAskep = [...existingAskep, ...askepIn.filter(x => x.id && !askepIds.has(x.id))];

            Data.saveLP(mergedLP);
            Data.saveAskep(mergedAskep);

            const currentProfile = Data.getProfile();
            const mergedProfile = { ...profileIn, ...currentProfile };
            Data.saveProfile(mergedProfile);
          }

          resolve({
            success: true,
            imported: {
              lp: lpIn.length,
              askep: askepIn.length
            }
          });
        } catch (err) {
          reject(new Error('File tidak valid: ' + err.message));
        }
      };

      reader.onerror = () => reject(new Error('Gagal membaca file'));
      reader.readAsText(file);
    });
  },

  async resetAll() {
    Storage.remove(CONFIG.STORAGE.LP);
    Storage.remove(CONFIG.STORAGE.ASKEP);
    Storage.remove(CONFIG.STORAGE.PROFILE);
    Storage.remove(CONFIG.STORAGE.BACKUP);
    Storage.remove(CONFIG.STORAGE.LAYOUT);
    Storage.remove(CONFIG.STORAGE.SESSION);
    Storage.remove(CONFIG.STORAGE.PROMO_DISMISSED);
    Storage.remove(CONFIG.STORAGE.ONBOARDED);
    return { success: true };
  }
};

/* ============================================================
   HELPERS
   ============================================================ */
function isValidDoc(doc) {
  return doc && typeof doc === 'object' && typeof doc.id === 'string';
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default {
  Storage,
  Data,
  StorageMonitor,
  Backup,
  ExportImport
};