/* ============================================================
   ZHENIN - Storage Monitor Widget (v2.3.0)
   Detail storage view dengan breakdown
   ============================================================ */

import { CONFIG } from './config.js';
import { StorageMonitor, Data } from './storage.js';

export const StorageWidget = {
  /**
   * Render widget ke container
   */
  render(containerId = 'storageWidget') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const stats = StorageMonitor.getStats();
    const pct = StorageMonitor.getUsagePct();
    const level = StorageMonitor.getLevel();
    
    let barClass = '';
    if (level === 'critical') barClass = 'critical';
    else if (level === 'warning') barClass = 'warning';
    
    const lpCount = Data.getLP().length;
    const askepCount = Data.getAskep().length;
    const backupCount = (() => {
      try {
        return JSON.parse(localStorage.getItem(CONFIG.STORAGE.BACKUP) || '[]').length;
      } catch (e) { return 0; }
    })();
    
    container.innerHTML = `
      <div class="storage-widget-header">
        <div class="storage-widget-icon">💾</div>
        <div class="storage-widget-title">Penyimpanan</div>
        <div class="storage-widget-pct ${barClass}">${Math.round(pct)}%</div>
      </div>
      <div class="storage-widget-bar">
        <div class="storage-widget-fill ${barClass}" style="width:${Math.min(pct, 100)}%"></div>
      </div>
      <div class="storage-widget-info">
        ${StorageMonitor.format(stats.total)} / ${CONFIG.STORAGE_MONITOR.LIMIT_MB} MB
      </div>
      <div class="storage-widget-detail">
        <span>📄 LP: ${lpCount} (${StorageMonitor.format(stats.lp)})</span>
        <span>📋 Askep: ${askepCount} (${StorageMonitor.format(stats.askep)})</span>
        <span>💾 Backup: ${backupCount} (${StorageMonitor.format(stats.backup)})</span>
      </div>
      ${level !== 'normal' ? `
        <div class="storage-widget-warning ${barClass}">
          ${level === 'critical'
            ? '⚠️ Penyimpanan hampir penuh! Export backup segera.'
            : '💡 Penyimpanan mulai penuh. Pertimbangkan backup.'}
        </div>
      ` : ''}
    `;
  },
  
  /**
   * Refresh
   */
  refresh() {
    StorageMonitor.invalidateCache();
    this.render();
  }
};

export default StorageWidget;