/* ============================================================
   ZHENIN - App.js (Main Application)
   ============================================================ */

import { CONFIG } from './config.js';
import { Storage, Data, StorageMonitor, Backup, ExportImport } from './storage.js';
import { Auth, ContactAdmin, DeviceFingerprint } from './auth.js';

/* ============================================================
   APP STATE
   ============================================================ */
const State = {
  currentScreen: 'splash',
  session: null,
  isAdmin: false,
  layout: {
    mode: 'mobile-portrait',
    previewVisible: true,
    splitRatio: 0.5
  },
  onboarding: {
    completed: false
  }
};

/* ============================================================
   UTILS
   ============================================================ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  if (hours < 24) return `${hours} jam lalu`;
  if (days < 7) return `${days} hari lalu`;
  if (days < 30) return `${Math.floor(days / 7)} minggu lalu`;
  return new Date(timestamp).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/* ============================================================
   UI COMPONENTS
   ============================================================ */
const UI = {
  // Toast
  toast(message, type = 'info', duration = CONFIG.TIMING.TOAST_DURATION_MS) {
    const container = $('#toastContainer');
    if (!container) return;

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ'}</span>
      <span class="toast-message">${escapeHtml(message)}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // Loading overlay
  showLoading(text = 'Memproses...') {
    const overlay = $('#loadingOverlay');
    const textEl = $('#loadingText');
    if (textEl) textEl.textContent = text;
    if (overlay) {
      overlay.hidden = false;
      overlay.classList.add('show');
    }
  },

  hideLoading() {
    const overlay = $('#loadingOverlay');
    if (overlay) {
      overlay.classList.remove('show');
      setTimeout(() => { overlay.hidden = true; }, 200);
    }
  },

  // Screen navigation
  goTo(screenId) {
    const screens = $$('.screen');
    screens.forEach(s => {
      s.classList.toggle('active', s.dataset.screen === screenId);
    });
    State.currentScreen = screenId;

    // Update body attribute
    document.body.setAttribute('data-page', screenId);

    // Update bottom nav
    $$('.bottom-nav .nav-item').forEach(item => {
      const nav = item.dataset.nav;
      const screenMap = { home: 'home', generate: 'ai', files: 'home', profile: 'profile' };
      item.classList.toggle('active', screenMap[nav] === screenId);
    });

    // Scroll to top
    const scroll = $(`.screen[data-screen="${screenId}"] .screen-scroll`);
    if (scroll) scroll.scrollTop = 0;

    // Update URL hash (tanpa history spam)
    try {
      if (screenId !== 'splash' && screenId !== 'login') {
        history.replaceState(null, '', `#${screenId}`);
      }
    } catch (e) { /* ignore */ }
  },

  // Modal
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.hidden = false;
      document.body.style.overflow = 'hidden';
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.hidden = true;
      document.body.style.overflow = '';
    }
  },

  closeAllModals() {
    $$('.modal-overlay').forEach(m => { m.hidden = true; });
    document.body.style.overflow = '';
  },

  // Confirm dialog
  async confirm(title, desc, options = {}) {
    return new Promise((resolve) => {
      const modal = $('#modalConfirm');
      const titleEl = $('#confirmTitle');
      const descEl = $('#confirmDesc');
      const okBtn = $('#confirmOk');
      const cancelBtn = $('#confirmCancel');
      const iconEl = $('#confirmIcon');

      titleEl.textContent = title;
      descEl.textContent = desc;
      iconEl.textContent = options.icon || '❓';
      okBtn.textContent = options.okText || 'Ya, Lanjutkan';
      okBtn.className = `btn ${options.danger === false ? 'btn-primary' : 'btn-danger'}`;

      modal.hidden = false;

      const cleanup = () => {
        modal.hidden = true;
        okBtn.onclick = null;
        cancelBtn.onclick = null;
      };

      okBtn.onclick = () => { cleanup(); resolve(true); };
      cancelBtn.onclick = () => { cleanup(); resolve(false); };
    });
  },

  // Button loading state
  setBtnLoading(btn, loading) {
    if (!btn) return;
    const spinner = btn.querySelector('.btn-spinner');
    const text = btn.querySelector('.btn-text');
    if (spinner) spinner.hidden = !loading;
    if (text) text.style.opacity = loading ? '0.5' : '1';
    btn.disabled = loading;
  }
};

/* ============================================================
   LAYOUT MANAGER
   ============================================================ */
const LayoutManager = {
  currentMode: null,

  detect() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const portrait = h > w;

    if (w < 768) return portrait ? 'mobile-portrait' : 'mobile-landscape';
    if (w < 1024) return portrait ? 'tablet-portrait' : 'tablet-landscape';
    return 'desktop';
  },

  apply() {
    const mode = this.detect();
    if (mode === this.currentMode) return;
    this.currentMode = mode;
    State.layout.mode = mode;
    document.body.setAttribute('data-layout', mode);
  },

  init() {
    this.apply();
    window.addEventListener('resize', debounce(() => this.apply(), 100));
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.apply(), 150);
    });
  }
};

/* ============================================================
   ONBOARDING
   ============================================================ */
const Onboarding = {
  shouldShow() {
    const done = Storage.load(CONFIG.STORAGE.ONBOARDED, false);
    return !done;
  },

  markComplete() {
    Storage.save(CONFIG.STORAGE.ONBOARDED, true);
  },

  show() {
    // Simple modal-based onboarding
    UI.toast('Selamat datang di Zhenin! Klik "✨ Generate" untuk mulai.', 'success', 5000);
    this.markComplete();
  }
};

/* ============================================================
   SPLASH SCREEN
   ============================================================ */
async function initSplash() {
  // Update version
  const versionEls = ['splashVersion', 'loginVersion', 'appVersionInfo'];
  versionEls.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = `v${CONFIG.APP_VERSION}`;
  });

  // Wait untuk splash
  await sleep(CONFIG.TIMING.SPLASH_DURATION_MS);

  // Check session
  const isLoggedIn = await Auth.verify();
  if (isLoggedIn) {
    State.session = Data.getSession();
    await initUserApp();
    UI.goTo('home');
  } else {
    UI.goTo('login');
  }
}

/* ============================================================
   LOGIN SCREEN
   ============================================================ */
function initLogin() {
  const form = $('#loginForm');
  const input = $('#passwordInput');
  const btn = $('#loginBtn');
  const toggle = $('#togglePassword');
  const toggleIcon = $('#togglePasswordIcon');
  const contactBtn = $('#contactAdminBtn');

  // Auto-format password
  input.addEventListener('input', (e) => {
    let v = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    e.target.value = v;
  });

  // Toggle password visibility
  let visible = false;
  toggle.addEventListener('click', () => {
    visible = !visible;
    input.type = visible ? 'text' : 'text'; // Selalu text karena password format bukan rahasia kuat
    toggleIcon.textContent = visible ? '🙈' : '👁';
  });

  // Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = input.value.trim();

    if (!password) {
      UI.toast('Masukkan password Anda', 'warning');
      input.focus();
      return;
    }

    UI.setBtnLoading(btn, true);

    try {
      const result = await Auth.login(password);

      if (result.success) {
        State.session = result.session;
        UI.toast('Login berhasil!', 'success');

        // Update user info
        await initUserApp();

        // Small delay untuk show toast
        await sleep(300);
        UI.goTo('home');

        // Show onboarding kalau first time
        if (Onboarding.shouldShow()) {
          setTimeout(() => Onboarding.show(), 800);
        }
      } else {
        UI.toast(result.error, 'error', 5000);
        input.select();
      }
    } catch (err) {
      console.error('Login error:', err);
      UI.toast('Terjadi kesalahan: ' + err.message, 'error');
    } finally {
      UI.setBtnLoading(btn, false);
    }
  });

  // Contact admin
  contactBtn.addEventListener('click', () => {
    showContactModal();
  });
}

/* ============================================================
   USER APP INIT (after login)
   ============================================================ */
async function initUserApp() {
  // Update UI dengan user info
  updateUserUI();

  // Init home
  initHome();

  // Init AI screen
  initAIScreen();

  // Init profile
  initProfile();

  // Init bottom nav
  initBottomNav();

  // Init modals
  initModals();

  // Init keyboard shortcuts
  initShortcuts();

  // Start auto backup
  startAutoBackup();

  // Update storage monitor
  updateStorageMonitor();
}

/* ============================================================
   UPDATE USER UI
   ============================================================ */
function updateUserUI() {
  const session = Data.getSession();
  if (!session) return;

  const profile = Data.getProfile();
  const initials = getInitials(profile.nama || 'User');

  // Avatar
  const avatars = ['userAvatar', 'profileAvatar'];
  avatars.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = initials;
  });

  // User name
  const displayName = profile.nama || 'User';
  const nameEls = ['userNameDisplay', 'profileName'];
  nameEls.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = displayName;
  });

  // Profile code
  const codeEl = $('#profileCode');
  if (codeEl) codeEl.textContent = session.password || '';

  // Token count
  updateTokenUI();

  // Contact hours
  const hoursEls = ['contactHours'];
  hoursEls.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = CONFIG.CONTACT.hoursShort;
  });
}

function updateTokenUI() {
  const session = Data.getSession();
  const token = session?.token || 0;

  // Token count home
  const tokenCount = $('#tokenCount');
  if (tokenCount) {
    animateNumber(tokenCount, token);
  }

  // Token cost info
  const costRemaining = $('#costRemaining');
  if (costRemaining) costRemaining.textContent = token;

  // Profile stat
  const statToken = $('#statToken');
  if (statToken) statToken.textContent = token;

  // Token warning
  const warning = $('#tokenWarning');
  if (warning) {
    warning.hidden = token >= CONFIG.LIMITS.TOKEN_WARNING_THRESHOLD;
  }
}

function animateNumber(el, target) {
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;
  const diff = target - current;
  const steps = Math.min(Math.abs(diff), 10);
  let step = 0;
  const interval = setInterval(() => {
    step++;
    el.textContent = Math.round(current + (diff * step / steps));
    if (step >= steps) {
      el.textContent = target;
      clearInterval(interval);
    }
  }, 30);
}

function getInitials(name) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ============================================================
   HOME SCREEN
   ============================================================ */
function initHome() {
  renderDocList();

  // Quick actions
  $$('[data-action="create-lp"]').forEach(btn => {
    btn.addEventListener('click', () => goToGenerate('lp'));
  });
  $$('[data-action="create-askep"]').forEach(btn => {
    btn.addEventListener('click', () => goToGenerate('askep'));
  });

  // Refresh button
  const refreshBtn = $('#btnRefresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.style.transform = 'rotate(360deg)';
      setTimeout(() => refreshBtn.style.transform = '', 500);
      await Auth.refreshSession();
      updateTokenUI();
      UI.toast('Data diperbarui', 'success');
    });
  }

  // Profile button
  const profileBtn = $('#btnProfile');
  if (profileBtn) {
    profileBtn.addEventListener('click', () => UI.goTo('profile'));
  }

  // Top-up buttons
  $('#btnTopup')?.addEventListener('click', () => showContactModal('topup'));
  $('#btnWarningTopup')?.addEventListener('click', () => showContactModal('topup'));

  // See all
  $('#btnSeeAll')?.addEventListener('click', () => {
    UI.toast('Fitur "Lihat Semua" akan tersedia di Sprint 2B', 'info');
  });

  // Promo close
  $('#promoClose')?.addEventListener('click', () => {
    Storage.save(CONFIG.STORAGE.PROMO_DISMISSED, Date.now());
    $('#promoBanner').hidden = true;
  });

  // Check promo
  checkPromo();
}

function renderDocList() {
  const lp = Data.getLP();
  const askep = Data.getAskep();
  const all = [
    ...lp.map(d => ({ ...d, _type: 'lp' })),
    ...askep.map(d => ({ ...d, _type: 'askep' }))
  ].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5);

  const listEl = $('#docList');
  const emptyEl = $('#emptyDocs');

  if (all.length === 0) {
    if (listEl) listEl.innerHTML = '';
    if (emptyEl) emptyEl.hidden = false;
    return;
  }

  if (emptyEl) emptyEl.hidden = true;

  listEl.innerHTML = all.map(doc => {
    const icon = doc._type === 'lp' ? '📄' : '📋';
    const typeLabel = doc._type === 'lp' ? 'LP' : 'Askep';
    const timeAgo = formatTimeAgo(doc.createdAt || Date.now());

    return `
      <div class="doc-item" data-doc-id="${escapeHtml(doc.id)}" data-doc-type="${doc._type}">
        <div class="doc-icon ${doc._type}">${icon}</div>
        <div class="doc-info">
          <div class="doc-title">${escapeHtml(doc.judul || 'Tanpa Judul')}</div>
          <div class="doc-meta">
            <span>${typeLabel}</span>
            <span class="dot"></span>
            <span>${timeAgo}</span>
          </div>
        </div>
        <button class="doc-menu" data-doc-menu="${escapeHtml(doc.id)}" data-doc-menu-type="${doc._type}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="1"/>
            <circle cx="19" cy="12" r="1"/>
            <circle cx="5" cy="12" r="1"/>
          </svg>
        </button>
      </div>
    `;
  }).join('');

  // Attach listeners
  $$('[data-doc-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-doc-menu]')) return;
      openDocument(el.dataset.docId, el.dataset.docType);
    });
  });

  $$('[data-doc-menu]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      showDocMenu(el.dataset.docMenu, el.dataset.docMenuType);
    });
  });
}

function checkPromo() {
  // Placeholder - akan diaktifkan Sprint 2C
  const banner = $('#promoBanner');
  if (banner) banner.hidden = true;
}

/* ============================================================
   PLACEHOLDER FUNCTIONS (untuk Sprint 2B & 2C)
   ============================================================ */
function goToGenerate(type = 'askep') {
  UI.goTo('ai');
  setTimeout(() => {
    const typeBtns = $$('.type-option');
    typeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
    const hiddenType = $('#aiType');
    if (hiddenType) hiddenType.value = type;
  }, 100);
}

function openDocument(docId, docType) {
  UI.toast(`Fitur buka dokumen akan tersedia di Sprint 2D`, 'info');
}

function showDocMenu(docId, docType) {
  UI.toast(`Menu dokumen akan tersedia di Sprint 2D`, 'info');
}

function initAIScreen() {
  // Placeholder - akan diisi Sprint 2C
  const form = $('#aiForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      UI.toast('AI generation akan tersedia di Sprint 2C', 'info');
    });
  }

  // Type selector
  $$('.type-option').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.type-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const hidden = $('#aiType');
      if (hidden) hidden.value = btn.dataset.type;
    });
  });

  // Prompt mode
  $$('.prompt-option').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.prompt-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      const hidden = $('#aiMode');
      if (hidden) hidden.value = mode;

      const customSection = $('#customPromptSection');
      if (customSection) customSection.hidden = mode !== 'custom';
    });
  });

  // Patient collapsible
  const patientToggle = $('#patientToggle');
  const patientBody = $('#patientBody');
  if (patientToggle && patientBody) {
    patientToggle.addEventListener('click', () => {
      const open = !patientBody.hidden;
      patientBody.hidden = open;
      patientToggle.classList.toggle('open', !open);
    });
  }

  // Topic suggestion
  $('#btnTopicSuggest')?.addEventListener('click', () => {
    showTopicSuggestions();
  });

  // Help
  $('#btnAiHelp')?.addEventListener('click', () => {
    UI.openModal('modalHelp');
  });
}

function initProfile() {
  // Update stats
  const statDocs = $('#statDocs');
  if (statDocs) {
    const total = Data.getLP().length + Data.getAskep().length;
    statDocs.textContent = total;
  }

  // Menu items
  $$('[data-menu]').forEach(item => {
    item.addEventListener('click', () => {
      const menu = item.dataset.menu;
      switch (menu) {
        case 'export-json':
          handleExportJSON();
          break;
        case 'import-json':
          handleImportJSON();
          break;
        case 'help':
          UI.openModal('modalHelp');
          break;
        case 'contact':
          showContactModal();
          break;
        case 'logout':
          handleLogout();
          break;
      }
    });
  });

  // Back button
  $$('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => UI.goTo(btn.dataset.back));
  });
}

async function handleExportJSON() {
  UI.showLoading('Menyiapkan backup...');
  try {
    const result = await ExportImport.exportJSON();
    UI.hideLoading();
    UI.toast(`Berhasil export: ${result.filename}`, 'success');
  } catch (err) {
    UI.hideLoading();
    UI.toast('Gagal export: ' + err.message, 'error');
  }
}

function handleImportJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const confirmed = await UI.confirm(
      'Import Data?',
      'Data akan digabungkan dengan data saat ini (merge).',
      { icon: '📥', okText: 'Import', danger: false }
    );

    if (!confirmed) return;

    UI.showLoading('Import data...');
    try {
      const result = await ExportImport.importJSON(file, 'merge');
      UI.hideLoading();
      UI.toast(
        `Import berhasil: ${result.imported.lp} LP, ${result.imported.askep} Askep`,
        'success',
        5000
      );
      renderDocList();
      updateUserUI();
    } catch (err) {
      UI.hideLoading();
      UI.toast('Gagal import: ' + err.message, 'error', 5000);
    }
  };
  input.click();
}

async function handleLogout() {
  const confirmed = await UI.confirm(
    'Keluar?',
    'Anda akan logout dari aplikasi. Data Anda tetap tersimpan.',
    { icon: '🚪', okText: 'Ya, Keluar' }
  );

  if (confirmed) {
    Auth.logout();
    State.session = null;
    UI.goTo('login');
    UI.toast('Berhasil logout', 'success');
  }
}

/* ============================================================
   BOTTOM NAV
   ============================================================ */
function initBottomNav() {
  $$('.bottom-nav .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const nav = item.dataset.nav;
      switch (nav) {
        case 'home': UI.goTo('home'); break;
        case 'generate': goToGenerate('askep'); break;
        case 'files': UI.toast('Fitur Files akan tersedia di Sprint 2B', 'info'); break;
        case 'profile': UI.goTo('profile'); break;
      }
    });
  });
}

/* ============================================================
   MODALS
   ============================================================ */
function initModals() {
  // Close buttons
  $$('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      UI.closeModal(btn.dataset.close);
    });
  });

  // Overlay click
  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        UI.closeModal(overlay.id);
      }
    });
  });

  // ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      UI.closeAllModals();
    }
  });

  // Contact WA
  const waBtn = $('#contactWaBtn');
  if (waBtn) {
    waBtn.addEventListener('click', () => {
      const session = Data.getSession();
      const passwordInfo = session ? ` (password: ${session.password})` : '';
      ContactAdmin.openWA(`Halo Admin Tian, saya ingin bertanya tentang Zhenin${passwordInfo}.`);
    });
  }
}

function showContactModal(reason = '') {
  const modal = $('#modalContact');
  if (!modal) return;

  // Update content
  $('#contactName').textContent = CONFIG.CONTACT.name;
  $('#contactWa').textContent = CONFIG.CONTACT.waDisplay;
  $('#contactWa').href = ContactAdmin.getWAUrl();
  $('#contactHoursFull').textContent = CONFIG.CONTACT.hours;
  $('#contactNote').textContent = CONFIG.CONTACT.note;

  UI.openModal('modalContact');
}

function showTopicSuggestions() {
  const grid = $('#topicGrid');
  if (!grid) return;

  grid.innerHTML = CONFIG.TOPIC_SUGGESTIONS.map(topic => `
    <button class="topic-chip" data-topic="${escapeHtml(topic)}">${escapeHtml(topic)}</button>
  `).join('');

  grid.querySelectorAll('.topic-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = $('#aiTopic');
      if (input) {
        input.value = btn.dataset.topic;
        input.focus();
      }
      UI.closeModal('modalTopics');
    });
  });

  UI.openModal('modalTopics');
}

/* ============================================================
   KEYBOARD SHORTCUTS
   ============================================================ */
function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'k':
          e.preventDefault();
          // Future: command palette
          break;
        case 'p':
          e.preventDefault();
          UI.goTo('profile');
          break;
        case 'h':
          e.preventDefault();
          UI.openModal('modalHelp');
          break;
      }
    }
  });
}

/* ============================================================
   AUTO BACKUP
   ============================================================ */
let autoBackupTimer = null;

function startAutoBackup() {
  if (autoBackupTimer) clearInterval(autoBackupTimer);
  autoBackupTimer = setInterval(() => {
    if (Auth.isLoggedIn()) {
      Backup.autoBackup();
    }
  }, CONFIG.TIMING.AUTOBACKUP_MS);
}

/* ============================================================
   STORAGE MONITOR
   ============================================================ */
function updateStorageMonitor() {
  // Placeholder - widget akan ada di Sprint 2B
  const level = StorageMonitor.getLevel();
  if (level === 'critical') {
    UI.toast('⚠️ Penyimpanan hampir penuh. Export backup!', 'warning', 5000);
  }
}

/* ============================================================
   SLEEP HELPER
   ============================================================ */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ============================================================
   INIT APP
   ============================================================ */
async function init() {
  console.log(`[Zhenin] v${CONFIG.APP_VERSION} starting...`);

  // Layout
  LayoutManager.init();

  // Prism language setup
  setupPrismLanguage();

  // Init screens
  initLogin();
  initModals();

  // Start splash
  await initSplash();

  // Listen untuk hash change (back button)
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    if (hash && ['home', 'ai', 'profile', 'result'].includes(hash)) {
      UI.goTo(hash);
    }
  });

  console.log('[Zhenin] Ready ✅');
}

function setupPrismLanguage() {
  if (!window.Prism) return;

  Prism.languages.keperawatan = {
    'comment': { pattern: /<!--[\s\S]*?-->/, greedy: true },
    'heading': { pattern: /^#{1,4} .+$/m, inside: { 'punctuation': /^#{1,4}/ } },
    'pagebreak': /\\page|\[PAGE_BREAK\]/,
    'special': /\[(GAMBAR|TABEL_TTD|NAMA_MHS|NAMA_CI|NIM|KELOMPOK|TEMPAT|PERIODE|TANGGAL|IDENTITAS_MHS)[^\]]*\]/,
    'table': /^\|.*\|$/m,
    'bold': { pattern: /\*\*[^*\n]+\*\*/, inside: { 'punctuation': /^\*\*|\*\*$/ } },
    'italic': { pattern: /(?<!\*)\*[^*\n]+\*(?!\*)/, inside: { 'punctuation': /^\*|\*$/ } },
    'underline': { pattern: /__[^_\n]+__/, inside: { 'punctuation': /^__|__$/ } },
    'strike': { pattern: /~~[^~\n]+~~/, inside: { 'punctuation': /^~~|~~$/ } },
    'highlight': { pattern: /==[^=\n]+==/, inside: { 'punctuation': /^==|==$/ } },
    'code': { pattern: /`[^`\n]+`/, inside: { 'punctuation': /^`|`$/ } },
    'bullet': /^\s*[-*•]\s/m,
    'numbered': /^\s*\d+\.\s/m,
    'blockquote': /^\s*>\s.+$/m
  };
}

/* ============================================================
   START
   ============================================================ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}