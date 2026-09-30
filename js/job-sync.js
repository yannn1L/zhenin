/* ============================================================
   ZHENIN - Job Sync Module (v2.10.0)
   Auto-retrieve pending jobs dari backend (offline-resilient)

   Fitur:
   - Check pending jobs saat app dibuka
   - Auto-save hasil ke localStorage
   - Mark retrieved di backend
   - Toast notification
   - Retry on network recovery

   Usage:
     JobSync.init()           // setup listener (online/offline/visibility)
     JobSync.checkNow()       // manual check
     JobSync.isChecking()     // status
   ============================================================ */

import { CONFIG } from './config.js';
import { Data } from './storage.js';

export const JobSync = {
  _checking: false,
  _lastCheck: 0,
  _minIntervalMs: 30000,  // 30 detik min antar check
  _initialized: false,
  _visibilityHandler: null,
  _onlineHandler: null,

  /**
   * Init — bind events, initial check
   */
  init() {
    if (this._initialized) return;
    this._initialized = true;

    // Bind online recovery
    this._onlineHandler = () => {
      console.log('[JobSync] Network online, checking pending jobs...');
      this.checkNow();
    };
    window.addEventListener('online', this._onlineHandler);

    // Bind visibility (saat user kembali ke app)
    this._visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        this.checkNow();
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);

    // Initial check (delay sedikit biar UI siap)
    setTimeout(() => this.checkNow(), 1500);
  },

  /**
   * Check pending jobs dari backend
   * @param {boolean} silent — kalau true, tidak tampil toast kalau kosong
   * @returns {Promise<{retrieved:number, failed:number}>}
   */
  async checkNow(silent = true) {
    if (this._checking) return { retrieved: 0, failed: 0 };

    // Throttle
    const now = Date.now();
    if (now - this._lastCheck < this._minIntervalMs && silent) {
      return { retrieved: 0, failed: 0 };
    }

    const session = Data.getSession();
    if (!session || !session.password || !session.deviceHash) {
      return { retrieved: 0, failed: 0 };
    }

    if (!navigator.onLine) {
      return { retrieved: 0, failed: 0 };
    }

    this._checking = true;
    this._lastCheck = now;

    try {
      const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'getPendingJobs',
          password: session.password,
          deviceHash: session.deviceHash
        })
      });

      if (!response.ok) throw new Error('HTTP ' + response.status);

      const result = await response.json();

      if (!result.success || !Array.isArray(result.jobs) || result.jobs.length === 0) {
        return { retrieved: 0, failed: 0 };
      }

      let retrievedCount = 0;
      let failedCount = 0;
      const retrievedJobs = [];
      const failedJobs = [];

      for (const job of result.jobs) {
        if (job.status === 'done') {
          const saved = this._saveJobToLocal(job);
          if (saved) {
            retrievedCount++;
            retrievedJobs.push(job);
            // Mark retrieved di backend (fire and forget)
            this._markRetrieved(job.jobId);
          }
        } else if (job.status === 'failed') {
          failedCount++;
          failedJobs.push(job);
          // Mark retrieved (biar tidak di-fetch lagi)
          this._markRetrieved(job.jobId);
        }
      }

      // Notifikasi
      if (retrievedCount > 0) {
        this._notifySuccess(retrievedCount, retrievedJobs);
      }
      if (failedCount > 0) {
        this._notifyFailed(failedCount, failedJobs);
      }

      // Refresh UI kalau ada retrieved
      if (retrievedCount > 0) {
        try {
          if (window.renderDocList) window.renderDocList();
          if (window.renderFilesList) window.renderFilesList();
          if (window.Profile && window.Profile.renderStats) {
            window.Profile.renderStats();
          }
        } catch (e) {
          console.warn('[JobSync] Refresh UI failed:', e.message);
        }
      }

      return { retrieved: retrievedCount, failed: failedCount };

    } catch (err) {
      // Silent fail (offline)
      if (!silent) console.warn('[JobSync] Check error:', err.message);
      return { retrieved: 0, failed: 0 };
    } finally {
      this._checking = false;
    }
  },

  /**
   * Save retrieved job ke localStorage
   * @returns {boolean} true kalau berhasil
   */
  _saveJobToLocal(job) {
    if (!job || !job.jobId || !job.result) return false;

    const doc = {
      id: job.jobId,
      judul: job.judul || 'Dokumen',
      type: job.type || 'askep',
      content: job.result,
      partial: job.partial || false,
      tanggal: new Date(job.completedAt || Date.now()).toISOString().slice(0, 10),
      createdAt: job.createdAt || Date.now(),
      updatedAt: job.completedAt || Date.now(),
      _fromBackground: true
    };

    try {
      if (job.type === 'lp') {
        const list = Data.getLP();
        if (!list.find(d => d.id === doc.id)) {
          list.unshift(doc);
          const res = Data.saveLP(list);
          return res && res.success;
        }
        return true; // sudah ada
      } else {
        const list = Data.getAskep();
        if (!list.find(d => d.id === doc.id)) {
          list.unshift(doc);
          const res = Data.saveAskep(list);
          return res && res.success;
        }
        return true; // sudah ada
      }
    } catch (e) {
      console.warn('[JobSync] Save local failed:', e.message);
      return false;
    }
  },

  /**
   * Mark retrieved di backend (fire & forget)
   */
  async _markRetrieved(jobId) {
    const session = Data.getSession();
    if (!session) return;

    try {
      await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'markJobRetrieved',
          password: session.password,
          deviceHash: session.deviceHash,
          jobId: jobId
        })
      });
    } catch (e) {
      // Silent — bisa di-retry kapanpun
      console.warn('[JobSync] Mark retrieved failed:', e.message);
    }
  },

  /**
   * Notifikasi sukses
   */
  _notifySuccess(count, jobs) {
    const message = count === 1
      ? '✅ Dokumen selesai di background: ' + (jobs[0].judul || 'Dokumen')
      : '✅ ' + count + ' dokumen selesai di background!';

    if (window.UI && window.UI.toast) {
      window.UI.toast(message, 'success', 6000);
    }

    // Show banner (opsional)
    this._showBanner(count, jobs);
  },

  /**
   * Notifikasi gagal
   */
  _notifyFailed(count, jobs) {
    const first = jobs[0];
    const message = count === 1
      ? '⚠️ Proses gagal: ' + (first.errorMessage || 'AI error')
      : '⚠️ ' + count + ' proses gagal di background';

    if (window.UI && window.UI.toast) {
      window.UI.toast(message, 'warning', 6000);
    }
  },

  /**
   * Show banner di home (opsional)
   */
  _showBanner(count, jobs) {
    const banner = document.getElementById('jobSyncBanner');
    if (!banner) return;

    const titleEl = banner.querySelector('.job-sync-title');
    const descEl = banner.querySelector('.job-sync-desc');
    const btnEl = banner.querySelector('.job-sync-action');

    if (titleEl) titleEl.textContent = '✅ ' + count + ' dokumen baru!';
    if (descEl) {
      descEl.textContent = count === 1
        ? (jobs[0].judul || 'Dokumen')
        : count + ' dokumen berhasil diselesaikan di background';
    }
    if (btnEl) {
      btnEl.onclick = () => {
        banner.hidden = true;
        if (window.UI && window.UI.goTo) {
          window.UI.goTo('files');
        }
      };
    }

    banner.hidden = false;

    // Auto-hide setelah 15 detik
    setTimeout(() => {
      if (banner) banner.hidden = true;
    }, 15000);
  },

  /**
   * Check status
   */
  isChecking() {
    return this._checking;
  },

  /**
   * Reset (untuk testing atau logout)
   */
  reset() {
    this._checking = false;
    this._lastCheck = 0;
  },

  /**
   * Cleanup listener
   */
  destroy() {
    if (this._onlineHandler) {
      window.removeEventListener('online', this._onlineHandler);
      this._onlineHandler = null;
    }
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
    this._initialized = false;
  }
};

export default JobSync;