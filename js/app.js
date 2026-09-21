/* ============================================================
   ZHENIN - App.js (v2.6.3 FINAL)
   FIX: username display priority, unified editor, bug check
   ============================================================ */

import { CONFIG } from './config.js';
import { Storage, Data, StorageMonitor, Backup, ExportImport } from './storage.js';
import { Auth, ContactAdmin, DeviceFingerprint } from './auth.js';
import Profile from './profile.js';
import TokenManager from './token-manager.js';
import AI from './ai.js';
import SessionGuard from './session-guard.js';
import Onboarding from './onboarding.js';
import Promo from './promo.js';
import StorageWidget from './storage-monitor.js';
import Editor from './editor.js';
import Parser from './parser.js';
import Renderer from './renderer.js';
import Exporter from './exporter.js';
import Username from './username.js';

/* ============================================================
   STATE
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
  currentDoc: null,
  viewMode: 'preview'
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
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ============================================================
   UI
   ============================================================ */
const UI = {
  toast(message, type = 'info', duration = CONFIG.TIMING.TOAST_DURATION_MS) {
    const container = $('#toastContainer');
    if (!container) return;

    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

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

  goTo(screenId) {
    const screens = $$('.screen');
    const currentScreen = State.currentScreen;
    if (currentScreen === screenId) return;

    if (currentScreen === 'result' && screenId !== 'result') {
      try { if (window.Editor) Editor.saveNow(); } catch (e) {}
    }

    screens.forEach(s => {
      s.classList.toggle('active', s.dataset.screen === screenId);
    });
    State.currentScreen = screenId;
    document.body.setAttribute('data-page', screenId);

    $$('.bottom-nav .nav-item').forEach(item => {
      const nav = item.dataset.nav;
      const screenMap = { home: 'home', generate: 'ai', files: 'files', profile: 'profile' };
      item.classList.toggle('active', screenMap[nav] === screenId);
    });

    const scroll = $(`.screen[data-screen="${screenId}"] .screen-scroll`);
    if (scroll) scroll.scrollTop = 0;

    if (screenId === 'profile') {
      Profile.init();
      StorageWidget.refresh();

      // ⚠️ FIX: Refresh user UI (nama dari username)
      updateUserUI();

      // Sync username dari backend
      Username.checkHasUsername().then(({ username }) => {
        if (username) {
          Username.saveLocalCache(username);
          Username.updateUI(username);
        }
      }).catch(() => {});
    }
    if (screenId === 'files') renderFilesList();
    if (screenId === 'home') renderDocList();

    if (screenId !== 'splash' && screenId !== 'login') {
      try {
        history.pushState({ screen: screenId }, '', '#' + screenId);
      } catch (e) { /* ignore */ }
    }
  },

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
    $$('.modal-overlay').forEach(m => {
      if (m.id === 'modalSessionExpired' && !m.hidden) return;
      if (m.id === 'modalUsernameRequired' && !m.hidden) return;
      m.hidden = true;
    });
    document.body.style.overflow = '';
  },

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

  setBtnLoading(btn, loading) {
    if (!btn) return;
    const spinner = btn.querySelector('.btn-spinner');
    const text = btn.querySelector('.btn-text');
    if (spinner) spinner.hidden = !loading;
    if (text) text.style.opacity = loading ? '0.5' : '1';
    btn.disabled = loading;
  }
};

window.UI = UI;

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
    window.addEventListener('orientationchange', () => setTimeout(() => this.apply(), 150));
  }
};

/* ============================================================
   SESSION MANAGER
   ============================================================ */
const SessionManager = {
  refreshTimer: null,
  isRefreshing: false,

  async refresh(silent = true) {
    if (this.isRefreshing) return { success: false };
    if (!Auth.isLoggedIn()) return { success: false };

    this.isRefreshing = true;
    try {
      const result = await Auth.refreshSession();
      if (result.success) {
        State.session = result.session;
        TokenManager.reset();
        TokenManager.refreshAllUI();
        if (!silent) UI.toast('Token diperbarui', 'success');
        return { success: true };
      } else {
        if (result.error && !['Network error', 'Failed to fetch'].includes(result.error)) {
          Auth.logout();
          State.session = null;
          UI.toast('Session berakhir. Silakan login kembali.', 'error', 5000);
          setTimeout(() => UI.goTo('login'), 1500);
        }
        return { success: false, error: result.error };
      }
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      this.isRefreshing = false;
    }
  },

  start() {
    this.stop();
    this.refreshTimer = setInterval(() => this.refresh(true), CONFIG.TIMING.SESSION_REFRESH_MS);
  },

  stop() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  },

  init() {
    this.start();
  }
};

/* ============================================================
   BACK BUTTON
   ============================================================ */
const BackButton = {
  initialized: false,
  handlePop() {
    const current = State.currentScreen;
    if (['home', 'login', 'splash'].includes(current)) {
      UI.confirm('Keluar aplikasi?', 'Anda yakin ingin keluar dari Zhenin?',
        { icon: '🚪', okText: 'Keluar' }
      ).then(confirmed => {
        if (!confirmed) {
          try { history.pushState({ screen: current }, '', '#' + current); } catch (e) {}
        } else {
          window.history.go(-2);
        }
      });
      return;
    }

    const parents = {
      'ai': 'home', 'profile': 'home', 'result': 'home',
      'loading': 'ai', 'files': 'home', 'admin': 'home'
    };
    UI.goTo(parents[current] || 'home');
  },
  init() {
    if (this.initialized) return;
    this.initialized = true;
    window.addEventListener('popstate', () => this.handlePop());
  }
};

/* ============================================================
   SPLASH
   ============================================================ */
async function initSplash() {
  ['splashVersion', 'loginVersion', 'appVersionInfo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = `v${CONFIG.APP_VERSION}`;
  });

  await sleep(CONFIG.TIMING.SPLASH_DURATION_MS);

  const isLoggedIn = await Auth.verify();
  if (isLoggedIn) {
    State.session = Data.getSession();

    // Load username cache dulu
    const cachedUsername = Username.getLocalCache();
    if (cachedUsername) Username.updateUI(cachedUsername);

    await initUserApp();

    // Enforce username jika belum ada
    const usernameCheck = await Username.enforce();
    if (usernameCheck.username) Username.updateUI(usernameCheck.username);

    UI.goTo('home');
  } else {
    UI.goTo('login');
  }
}

/* ============================================================
   LOGIN
   ============================================================ */
function initLogin() {
  const form = $('#loginForm');
  const input = $('#passwordInput');
  const btn = $('#loginBtn');
  const contactBtn = $('#contactAdminBtn');
  const clearBtn = $('#clearPassword');

  input.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      input.focus();
    });
  }

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
        StorageMonitor.invalidateCache();
        TokenManager.reset();

        // Save username dari backend ke cache
        if (result.username) {
          Username.saveLocalCache(result.username);
        }

        UI.toast('Login berhasil!', 'success');

        await initUserApp();
        await sleep(300);

        // Enforce username (first login)
        const usernameCheck = await Username.enforce();
        if (usernameCheck.username) {
          Username.updateUI(usernameCheck.username);
        }

        UI.goTo('home');

        if (!Data.isOnboarded()) {
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

  if (contactBtn) {
    contactBtn.addEventListener('click', () => showContactModal());
  }
}

/* ============================================================
   USER APP INIT
   ============================================================ */
async function initUserApp() {
  window.Profile = Profile;
  window.Username = Username;

  // ⚠️ FIX: Load username dulu dari backend sebelum render UI
  try {
    const usernameCheck = await Username.checkHasUsername();
    if (usernameCheck.username) {
      Username.saveLocalCache(usernameCheck.username);
    }
  } catch (e) {
    console.warn('[initUserApp] Username load failed:', e.message);
  }

  // Render UI dengan username yang sudah ada
  updateUserUI();

  Profile.init();
  TokenManager.refreshAllUI();
  initHome();
  initAIScreen();
  initResultScreen();
  initProfile();
  initFilesScreen();
  initBottomNav();
  initModals();
  initShortcuts();
  startAutoBackup();

  SessionManager.init();
  BackButton.init();

  SessionGuard.init(({ title, message, icon }) => {
    showSessionExpiredDialog(title, message, icon);
  });

  Promo.load().catch(() => {});
  setTimeout(() => SessionManager.refresh(true), 2000);
}

/* ============================================================
   UPDATE USER UI
   ============================================================ */
function updateUserUI() {
  const session = Data.getSession();
  if (!session) return;

  // ⚠️ FIX: Prioritas username > nama mahasiswa > "User"
  const username = Username.getLocalCache();
  const profile = Data.getProfile();
  const displayName = username || profile.nama || 'User';

  const initial = displayName.charAt(0).toUpperCase();

  // Avatar
  const avatars = ['userAvatar', 'profileAvatar'];
  avatars.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = initial;
  });

  // Name display
  const nameEls = ['userNameDisplay', 'profileName'];
  nameEls.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = displayName;
  });

  // Profile code
  const codeEl = $('#profileCode');
  if (codeEl) codeEl.textContent = session.password || '';

  updateTokenUI();

  const hoursEls = ['contactHours'];
  hoursEls.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = CONFIG.CONTACT.hoursShort;
  });
}

function updateTokenUI() {
  const session = Data.getSession();
  const token = session?.token || 0;

  const tokenCount = $('#tokenCount');
  if (tokenCount) {
    animateNumber(tokenCount, token);
  }

  const costRemaining = $('#costRemaining');
  if (costRemaining) costRemaining.textContent = token;

  const statToken = $('#statToken');
  if (statToken) statToken.textContent = token;

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
  if (steps === 0) {
    el.textContent = target;
    return;
  }
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
   SESSION EXPIRED
   ============================================================ */
function showSessionExpiredDialog(title, message, icon = '⚠️') {
  if (window._sessionExpiredShown) return;
  window._sessionExpiredShown = true;

  try { Profile.saveNow(); } catch (e) {}

  const modal = document.getElementById('modalSessionExpired');
  if (modal) {
    const titleEl = document.getElementById('sessionExpiredTitle');
    const descEl = document.getElementById('sessionExpiredDesc');
    const iconEl = document.getElementById('sessionExpiredIcon');

    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = message;
    if (iconEl) iconEl.textContent = icon;

    modal.hidden = false;
    document.body.style.overflow = 'hidden';

    const okBtn = document.getElementById('sessionExpiredOk');
    if (okBtn && !okBtn.dataset.bound) {
      okBtn.dataset.bound = '1';
      okBtn.addEventListener('click', () => performForceLogout());
    }
  } else {
    performForceLogout();
  }
}

function performForceLogout() {
  SessionManager.stop();
  SessionGuard.destroy();
  Onboarding.hide(false);
  try { Editor.cleanup(); } catch (e) {}

  Auth.logout();
  State.session = null;
  TokenManager.reset();
  window._sessionExpiredShown = false;

  UI.closeAllModals();
  UI.goTo('login');
  UI.toast('Anda telah logout. Silakan login kembali.', 'info', 4000);
}

/* ============================================================
   HOME
   ============================================================ */
function initHome() {
  renderDocList();

  $$('[data-action="create-lp"]').forEach(btn => {
    btn.addEventListener('click', () => goToGenerate('lp'));
  });
  $$('[data-action="create-askep"]').forEach(btn => {
    btn.addEventListener('click', () => goToGenerate('askep'));
  });

  $('#btnRefresh')?.addEventListener('click', async function() {
    this.style.transform = 'rotate(360deg)';
    setTimeout(() => this.style.transform = '', 500);
    await SessionManager.refresh(false);
    await SessionGuard.checkNow();
    await Username.checkHasUsername().then(({ username }) => {
      if (username) {
        Username.saveLocalCache(username);
        Username.updateUI(username);
      }
    }).catch(() => {});
  });

  $('#btnProfile')?.addEventListener('click', () => UI.goTo('profile'));
  $('#btnTopup')?.addEventListener('click', () => showContactModal('topup'));
  $('#btnWarningTopup')?.addEventListener('click', () => showContactModal('topup'));
  $('#btnSeeAll')?.addEventListener('click', () => UI.goTo('files'));
  $('#promoClose')?.addEventListener('click', () => Promo.dismiss());
}

function renderDocList() {
  const all = getAllDocs().slice(0, 5);
  const listEl = $('#docList');
  const emptyEl = $('#emptyDocs');

  if (all.length === 0) {
    if (listEl) listEl.innerHTML = '';
    if (emptyEl) emptyEl.hidden = false;
    return;
  }

  if (emptyEl) emptyEl.hidden = true;

  listEl.innerHTML = all.map(doc => renderDocItem(doc)).join('');
  bindDocListEvents(listEl);
}

function getAllDocs() {
  const lp = Data.getLP().map(d => ({ ...d, _type: 'lp' }));
  const askep = Data.getAskep().map(d => ({ ...d, _type: 'askep' }));
  return [...lp, ...askep].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function renderDocItem(doc) {
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
}

function bindDocListEvents(container) {
  container.querySelectorAll('[data-doc-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-doc-menu]')) return;
      openDocument(el.dataset.docId, el.dataset.docType);
    });
  });

  container.querySelectorAll('[data-doc-menu]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      showDocActionsMenu(el.dataset.docMenu, el.dataset.docMenuType);
    });
  });
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function goToGenerate(type = 'askep') {
  UI.goTo('ai');
  setTimeout(() => {
    $$('.type-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
    const hiddenType = $('#aiType');
    if (hiddenType) hiddenType.value = type;
  }, 100);
}

function openDocument(docId, docType) {
  try {
    if (Editor.getCurrentDocId() && Editor.getCurrentDocId() !== docId) {
      try { Editor.cleanup(); } catch (e) {}
    }

    const doc = Editor.load(docId, docType);
    State.currentDoc = { ...doc, _type: docType };
    AI.setCurrentDocId(docId);

    const titleEl = $('#resultTitle');
    if (titleEl) titleEl.textContent = doc.judul || 'Dokumen';

    Editor.render();
    UI.goTo('result');
  } catch (err) {
    console.error('[openDocument] Error:', err);
    UI.toast('Gagal buka dokumen: ' + err.message, 'error');
  }
}

/* ============================================================
   AI SCREEN
   ============================================================ */
function initAIScreen() {
  AI.initAIScreen();

  $('#btnTopicSuggest')?.addEventListener('click', (e) => {
    e.preventDefault();
    showTopicSuggestions();
  });

  $('#btnAiHelp')?.addEventListener('click', (e) => {
    e.preventDefault();
    UI.openModal('modalHelp');
  });
}

async function handleAISubmit(e) {
  e.preventDefault();

  const btn = $('#btnGenerate');
  UI.setBtnLoading(btn, true);

  try {
    const guardResult = await SessionGuard.checkNow();
    if (!guardResult.success && !['network_error', 'offline'].includes(guardResult.reason)) {
      return;
    }

    const requestBody = await AI.generate();

    UI.goTo('loading');
    AI.startLoadingScreen();

    const result = await AI.callBackend(requestBody);

    AI.stopLoadingScreen();

    if (!result.success) {
      const errorMsg = result.error || 'AI gagal';
      const mapped = AI.mapError({ message: errorMsg });
      await SessionManager.refresh(true);
      UI.goTo('ai');
      UI.toast(mapped.text, mapped.type, 5000);
      return;
    }

    const validation = AI.validateResult(result);
    if (!validation.valid) {
      await SessionManager.refresh(true);
      UI.goTo('ai');
      UI.toast('⚠️ ' + validation.reason, 'warning', 5000);
      return;
    }

    const formData = AI.collectFormData();
    const prompt = requestBody.prompt;

    let doc;
    try {
      doc = AI.saveResult(validation.content, formData, prompt);
    } catch (saveErr) {
      console.error('[AI Submit] Save error:', saveErr);
      await SessionManager.refresh(true);
      UI.goTo('ai');
      UI.toast('❌ ' + saveErr.message, 'error', 5000);
      return;
    }

    if (typeof result.remainingToken === 'number') {
      TokenManager.updateFromResponse(result.remainingToken);
    }

    State.currentDoc = { ...doc, _type: formData.type };
    AI.setCurrentDocId(doc.id);

    try {
      Editor.load(doc.id, formData.type);
      Editor.render();
    } catch (editorErr) {
      console.error('[AI Submit] Editor load error:', editorErr);
      UI.toast('Dokumen tersimpan tapi gagal tampil. Buka dari File.', 'warning', 5000);
      UI.goTo('home');
      renderDocList();
      return;
    }

    UI.toast('✅ Dokumen berhasil dibuat!', 'success');
    UI.goTo('result');

  } catch (err) {
    console.error('AI Submit error:', err);
    AI.stopLoadingScreen();

    const mapped = AI.mapError(err);

    if (State.currentScreen === 'loading') {
      UI.goTo('ai');
    }

    if (err.code === 'NO_TOKEN') {
      UI.confirm(
        'Token Habis',
        'Token Anda habis. Hubungi admin untuk top-up.',
        { icon: '💎', okText: 'Hubungi Admin', danger: false }
      ).then(confirmed => {
        if (confirmed) showContactModal('topup');
      });
    } else {
      UI.toast(mapped.text, mapped.type, 5000);
    }
  } finally {
    UI.setBtnLoading(btn, false);
  }
}

window.handleAISubmit = handleAISubmit;

/* ============================================================
   RESULT SCREEN
   ============================================================ */
function initResultScreen() {
  $$('[data-view-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      Editor.setMode(btn.dataset.viewMode);
    });
  });

  const editorEl = $('#resultEditor');
  if (editorEl) {
    editorEl.addEventListener('input', () => {
      Editor.updateFromEditor();
    });
  }

  $('#btnRegenerate')?.addEventListener('click', handleRegenerate);
  $('#btnExport')?.addEventListener('click', handleExportDocx);
  $('#btnResultMenu')?.addEventListener('click', () => {
    if (State.currentDoc) {
      showDocActionsMenu(State.currentDoc.id, State.currentDoc._type);
    }
  });
}

function renderResultScreen() {
  const doc = State.currentDoc;
  if (!doc) return;

  const titleEl = $('#resultTitle');
  if (titleEl) titleEl.textContent = doc.judul || 'Dokumen';

  Editor.render();
}

async function handleRegenerate() {
  const request = AI.getCurrentRequest();
  if (!request) {
    UI.toast('Request tidak tersedia', 'warning');
    return;
  }

  const confirmed = await UI.confirm(
    'Regenerate Dokumen?',
    'AI akan membuat ulang dokumen. Membutuhkan 1 token.',
    { icon: '🔄', okText: 'Regenerate', danger: false }
  );

  if (!confirmed) return;
  if (!TokenManager.hasEnough(1)) {
    UI.toast('Token habis', 'warning');
    return;
  }

  $('#aiForm').dispatchEvent(new Event('submit'));
}

async function handleExportDocx() {
  if (!State.currentDoc) {
    UI.toast('Dokumen tidak ditemukan', 'error');
    return;
  }

  const editorDocId = Editor.getCurrentDocId();
  if (!editorDocId || editorDocId !== State.currentDoc.id) {
    UI.toast('Dokumen berubah, mohon buka ulang', 'warning');
    return;
  }

  Editor.saveNow();

  UI.showLoading('Menyiapkan DOCX...');

  try {
    const result = await Editor.exportDocx();
    UI.hideLoading();
    UI.toast('✅ Berhasil: ' + result.filename, 'success', 4000);
  } catch (err) {
    UI.hideLoading();
    console.error('Export error:', err);
    UI.toast('❌ Gagal export: ' + err.message, 'error', 5000);
  }
}

/* ============================================================
   PROFILE SCREEN
   ============================================================ */
function initProfile() {
  $$('[data-menu]').forEach(item => {
    item.addEventListener('click', () => {
      const menu = item.dataset.menu;
      switch (menu) {
        case 'export-json': handleExportJSON(); break;
        case 'import-json': handleImportJSON(); break;
        case 'help': UI.openModal('modalHelp'); break;
        case 'contact': showContactModal(); break;
        case 'onboarding':
          Data.resetOnboarding();
          Onboarding.show();
          break;
        case 'logout': handleLogout(); break;
      }
    });
  });

  $$('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => UI.goTo(btn.dataset.back));
  });

  // Username field
  const usernameInput = $('#profileUsernameInput');
  const saveUsernameBtn = $('#btnSaveUsername');

  if (usernameInput) {
    const cached = Username.getLocalCache();
    usernameInput.value = cached || '';

    Username.checkHasUsername().then(({ username }) => {
      if (username && !usernameInput.value) {
        usernameInput.value = username;
        Username.saveLocalCache(username);
      }
    }).catch(() => {});
  }

  if (saveUsernameBtn) {
    saveUsernameBtn.addEventListener('click', async () => {
      const newUsername = usernameInput?.value.trim();

      if (!newUsername) {
        UI.toast('Username tidak boleh kosong', 'warning');
        return;
      }

      if (newUsername.length < 2) {
        UI.toast('Username minimal 2 karakter', 'warning');
        return;
      }

      if (newUsername === Username.getLocalCache()) {
        UI.toast('Username tidak berubah', 'info');
        return;
      }

      UI.setBtnLoading(saveUsernameBtn, true);

      try {
        await Username.set(newUsername);
        Username.updateUI(newUsername);
        UI.toast('✅ Username berhasil disimpan', 'success');
      } catch (err) {
        UI.toast('❌ Gagal: ' + err.message, 'error', 5000);
      } finally {
        UI.setBtnLoading(saveUsernameBtn, false);
      }
    });
  }
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
        'success', 5000
      );
      renderDocList();
      renderFilesList();
      Profile.init();
      TokenManager.refreshAllUI();
      StorageWidget.refresh();
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
    try { Profile.saveNow(); } catch (e) {}
    try { Editor.cleanup(); } catch (e) {}

    SessionManager.stop();
    SessionGuard.destroy();
    Auth.logout();
    State.session = null;
    TokenManager.reset();
    UI.goTo('login');
    UI.toast('Berhasil logout', 'success');
  }
}

/* ============================================================
   FILES SCREEN
   ============================================================ */
let filesFilter = 'all';

function initFilesScreen() {
  $$('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filesFilter = btn.dataset.filter;
      renderFilesList();
    });
  });
}

function renderFilesList() {
  let docs = getAllDocs();

  if (filesFilter === 'lp') docs = docs.filter(d => d._type === 'lp');
  if (filesFilter === 'askep') docs = docs.filter(d => d._type === 'askep');

  const listEl = $('#filesDocList');
  const emptyEl = $('#filesEmpty');

  if (!docs.length) {
    if (listEl) listEl.innerHTML = '';
    if (emptyEl) emptyEl.hidden = false;
    return;
  }

  if (emptyEl) emptyEl.hidden = true;

  listEl.innerHTML = docs.map(doc => renderDocItem(doc)).join('');
  bindDocListEvents(listEl);
}

/* ============================================================
   DOC ACTIONS
   ============================================================ */
let docActionTarget = null;

function showDocActionsMenu(docId, docType) {
  docActionTarget = { id: docId, type: docType };
  UI.openModal('modalDocActions');
}

function initDocActionsModal() {
  $$('[data-doc-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.docAction;
      const target = docActionTarget;
      UI.closeModal('modalDocActions');

      if (!target) return;

      switch (action) {
        case 'open': openDocument(target.id, target.type); break;
        case 'rename': showRenameModal(target.id, target.type); break;
        case 'duplicate': duplicateDoc(target.id, target.type); break;
        case 'export': await exportDocById(target.id, target.type); break;
        case 'delete':
          const confirmed = await UI.confirm(
            'Hapus Dokumen?',
            'Dokumen akan dihapus permanen.',
            { icon: '🗑️', okText: 'Hapus' }
          );
          if (confirmed) {
            AI.deleteDocument(target.id, target.type);
            UI.toast('Dokumen dihapus', 'success');
            renderDocList();
            renderFilesList();
            Profile.renderStats();
            StorageWidget.refresh();
          }
          break;
      }
    });
  });
}

async function exportDocById(docId, docType) {
  const doc = AI.getDocument(docId, docType);
  if (!doc) {
    UI.toast('Dokumen tidak ditemukan', 'error');
    return;
  }

  const content = (doc.content || '').trim();
  if (content.length < 50) {
    UI.toast('Dokumen kosong atau terlalu pendek', 'warning');
    return;
  }

  UI.showLoading('Menyiapkan DOCX...');
  try {
    const result = await Exporter.exportDocx(content, {
      title: doc.judul || 'Dokumen',
      filename: doc.judul || 'Dokumen',
      docId: docId
    });
    UI.hideLoading();
    UI.toast('✅ ' + result.filename, 'success', 4000);
  } catch (err) {
    UI.hideLoading();
    UI.toast('❌ Gagal export: ' + err.message, 'error', 5000);
  }
}

function showRenameModal(docId, docType) {
  const doc = AI.getDocument(docId, docType);
  if (!doc) return;

  const input = $('#renameInput');
  if (input) input.value = doc.judul || '';
  UI.openModal('modalRename');

  setTimeout(() => {
    input?.focus();
    input?.select();
  }, 100);
}

function initRenameModal() {
  $('#renameSave')?.addEventListener('click', () => {
    if (!docActionTarget) return;
    const input = $('#renameInput');
    const newTitle = input?.value.trim();
    if (!newTitle) {
      UI.toast('Judul tidak boleh kosong', 'warning');
      return;
    }

    AI.updateDocument(docActionTarget.id, docActionTarget.type, { judul: newTitle });
    UI.closeModal('modalRename');
    UI.toast('Judul diubah', 'success');
    renderDocList();
    renderFilesList();
  });
}

function duplicateDoc(docId, docType) {
  const doc = AI.getDocument(docId, docType);
  if (!doc) return;

  const newDoc = {
    ...doc,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    judul: (doc.judul || 'Dokumen') + ' (copy)',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  if (docType === 'lp') {
    const list = Data.getLP();
    list.unshift(newDoc);
    Data.saveLP(list);
  } else {
    const list = Data.getAskep();
    list.unshift(newDoc);
    Data.saveAskep(list);
  }

  UI.toast('Dokumen diduplikat', 'success');
  renderDocList();
  renderFilesList();
  StorageWidget.refresh();
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
        case 'files': UI.goTo('files'); break;
        case 'profile': UI.goTo('profile'); break;
      }
    });
  });
}

/* ============================================================
   MODALS
   ============================================================ */
function initModals() {
  $$('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.close === 'modalUsernameRequired') return;
      UI.closeModal(btn.dataset.close);
    });
  });

  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        if (overlay.id === 'modalSessionExpired') return;
        if (overlay.id === 'modalUsernameRequired') return;
        UI.closeModal(overlay.id);
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const expiredModal = document.getElementById('modalSessionExpired');
      if (expiredModal && !expiredModal.hidden) return;

      const usernameModal = document.getElementById('modalUsernameRequired');
      if (usernameModal && !usernameModal.hidden) return;

      UI.closeAllModals();
    }
  });

  const waBtn = $('#contactWaBtn');
  if (waBtn) {
    waBtn.addEventListener('click', () => {
      const session = Data.getSession();
      const pw = session ? ` (password: ${session.password})` : '';
      ContactAdmin.openWA(`Halo Admin Tian, saya ingin bertanya tentang Zhenin${pw}.`);
    });
  }

  initDocActionsModal();
  initRenameModal();
}

function showContactModal(reason = '') {
  const modal = $('#modalContact');
  if (!modal) return;

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
   KEYBOARD
   ============================================================ */
function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'p': e.preventDefault(); UI.goTo('profile'); break;
        case 'h': e.preventDefault(); UI.openModal('modalHelp'); break;
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
      try { Profile.saveNow(); } catch (e) {}
      try { Editor.saveNow(); } catch (e) {}
      Backup.autoBackup();
    }
  }, CONFIG.TIMING.AUTOBACKUP_MS);
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
  console.log(`[Zhenin] v${CONFIG.APP_VERSION} starting...`);

  LayoutManager.init();
  setupPrismLanguage();

  initLogin();
  initModals();

  await initSplash();

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    if (hash && ['home', 'ai', 'profile', 'files', 'result'].includes(hash)) {
      if (hash !== State.currentScreen) UI.goTo(hash);
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}