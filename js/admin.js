/* ============================================================
   ZHENIN - Admin Panel (v2.6.1)
   Full admin features: dashboard, generate, topup, users, settings
   ============================================================ */

import { CONFIG } from './config.js';
import { Data, Storage } from './storage.js';

const State = {
  session: null,
  currentTab: 'dashboard',
  usersCache: [],
  statsCache: null,
  templatesCache: null,
  pricingCache: null,
  contactCache: null,
  promoCache: null,
  searchTimer: null,
  currentPage: 1,
  currentFilter: 'all',
  _loading: false
};

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(msg, type = 'info', duration = 3200) {
  const container = $('#adminToast');
  if (!container) return;
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span class="toast-message">${escapeHtml(msg)}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 300); }, duration);
}

function showLoading(text = 'Memproses...') {
  const el = $('#adminLoading');
  if (!el) return;
  const txt = $('#adminLoadingText');
  if (txt) txt.textContent = text;
  el.hidden = false;
  el.classList.add('show');
}

function hideLoading() {
  const el = $('#adminLoading');
  if (!el) return;
  el.classList.remove('show');
  setTimeout(() => { el.hidden = true; }, 200);
}

async function callApi(action, params = {}) {
  if (!CONFIG.APPS_SCRIPT_URL) throw new Error('Backend belum dikonfigurasi');

  const body = { action, ...params };

  const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });

  if (!response.ok) throw new Error('HTTP ' + response.status);
  return await response.json();
}

/* ============================================================
   ADMIN AUTH
   ============================================================ */
const AdminAuth = {
  async login(password) {
    if (!password || !password.trim()) {
      return { success: false, error: 'Password tidak boleh kosong' };
    }

    const result = await callApi('adminLogin', { password: password.trim() });

    if (!result.valid) {
      return { success: false, error: result.message || 'Login gagal' };
    }

    const session = {
      token: result.sessionToken,
      password: password.trim(),
      loginAt: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000)
    };

    Data.saveAdminSession(session);
    return { success: true, session };
  },

  logout() {
    Data.clearAdminSession();
  },

  isLoggedIn() {
    return !!Data.getAdminSession();
  },

  getSession() {
    return Data.getAdminSession();
  }
};

/* ============================================================
   RENDER: LOGIN SCREEN
   ============================================================ */
function renderAdminLogin() {
  const root = document.getElementById('adminRoot');
  if (!root) return;

  root.innerHTML = `
    <div class="admin-login-wrap">
      <div class="admin-login-card">
        <div class="admin-login-logo">
          <svg viewBox="0 0 100 100" fill="none">
            <path d="M50 15 L85 50 L50 85 L15 50 Z" stroke="#C9A961" stroke-width="2" fill="none"/>
            <path d="M50 30 L50 70 M30 50 L70 50" stroke="#A67BC8" stroke-width="3" stroke-linecap="round"/>
            <circle cx="50" cy="50" r="8" fill="#6B3FA0" stroke="#C9A961" stroke-width="2"/>
          </svg>
        </div>
        <h1 class="admin-login-title">ZHENIN</h1>
        <p class="admin-login-subtitle">Admin Panel</p>

        <form id="adminLoginForm" autocomplete="off">
          <div class="form-field">
            <label class="form-label">Password Admin</label>
            <input type="password" id="adminPassword" class="form-input" placeholder="••••••••" required>
          </div>
          <button type="submit" class="btn btn-primary btn-block btn-lg" id="adminLoginBtn">
            <span class="btn-text">Masuk</span>
            <span class="btn-spinner" hidden></span>
          </button>
        </form>

        <div class="admin-login-footer">
          <a href="/" class="link-btn">← Kembali ke aplikasi</a>
        </div>
        <div class="admin-login-version">v${CONFIG.APP_VERSION}</div>
      </div>
    </div>
    <div class="toast-container" id="adminToast"></div>
    <div class="loading-overlay" id="adminLoading" hidden>
      <div class="loading-box">
        <div class="loading-orb"><div class="loading-orb-inner"></div></div>
        <div class="loading-text" id="adminLoadingText">Memproses...</div>
      </div>
    </div>
  `;

  const form = $('#adminLoginForm');
  const btn = $('#adminLoginBtn');
  const input = $('#adminPassword');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = input.value;
    if (!pw) { toast('Masukkan password', 'warning'); return; }

    btn.disabled = true;
    const spinner = btn.querySelector('.btn-spinner');
    const text = btn.querySelector('.btn-text');
    if (spinner) spinner.hidden = false;
    if (text) text.style.opacity = '0.5';

    try {
      const result = await AdminAuth.login(pw);
      if (result.success) {
        State.session = result.session;
        toast('Login berhasil', 'success');
        renderAdminDashboard();
      } else {
        toast(result.error, 'error', 5000);
        input.select();
      }
    } catch (err) {
      toast('Error: ' + err.message, 'error', 5000);
    } finally {
      btn.disabled = false;
      if (spinner) spinner.hidden = true;
      if (text) text.style.opacity = '1';
    }
  });
}

/* ============================================================
   RENDER: DASHBOARD (Main Admin)
   ============================================================ */
function renderAdminDashboard() {
  const root = document.getElementById('adminRoot');
  if (!root) return;

  const session = AdminAuth.getSession();
  if (!session) {
    renderAdminLogin();
    return;
  }

  root.innerHTML = `
    <div class="admin-app">
      <header class="admin-header">
        <div class="admin-header-left">
          <div class="admin-logo">🔧</div>
          <div>
            <div class="admin-title">ZHENIN ADMIN</div>
            <div class="admin-subtitle">Panel Kontrol</div>
          </div>
        </div>
        <div class="admin-header-right">
          <button class="icon-btn" id="adminRefreshBtn" title="Refresh">🔄</button>
          <button class="icon-btn" id="adminLogoutBtn" title="Logout">🚪</button>
        </div>
      </header>

      <nav class="admin-nav">
        <button class="admin-nav-btn active" data-tab="dashboard">📊 Dashboard</button>
        <button class="admin-nav-btn" data-tab="generate">➕ Generate</button>
        <button class="admin-nav-btn" data-tab="topup">💎 Top-up</button>
        <button class="admin-nav-btn" data-tab="users">👥 Users</button>
        <button class="admin-nav-btn" data-tab="templates">⚙️ Templates</button>
        <button class="admin-nav-btn" data-tab="settings">🔧 Settings</button>
      </nav>

      <main class="admin-main" id="adminMain">
        <div class="admin-loading-placeholder">Memuat...</div>
      </main>
    </div>
    <div class="toast-container" id="adminToast"></div>
    <div class="loading-overlay" id="adminLoading" hidden>
      <div class="loading-box">
        <div class="loading-orb"><div class="loading-orb-inner"></div></div>
        <div class="loading-text" id="adminLoadingText">Memproses...</div>
      </div>
    </div>
  `;

  // Header actions
  $('#adminRefreshBtn').addEventListener('click', () => {
    toast('Refresh data...', 'info');
    renderTab(State.currentTab);
  });

  $('#adminLogoutBtn').addEventListener('click', async () => {
    if (!confirm('Logout dari admin panel?')) return;
    AdminAuth.logout();
    State.session = null;
    renderAdminLogin();
  });

  // Nav tabs
  $$('.admin-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.admin-nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.currentTab = btn.dataset.tab;
      renderTab(State.currentTab);
    });
  });

  // Load initial
  renderTab('dashboard');
}

function renderTab(tab) {
  const main = $('#adminMain');
  if (!main) return;

  switch (tab) {
    case 'dashboard': renderDashboardTab(main); break;
    case 'generate': renderGenerateTab(main); break;
    case 'topup': renderTopupTab(main); break;
    case 'users': renderUsersTab(main); break;
    case 'templates': renderTemplatesTab(main); break;
    case 'settings': renderSettingsTab(main); break;
  }
}

/* ============================================================
   TAB: DASHBOARD
   ============================================================ */
async function renderDashboardTab(main) {
  main.innerHTML = '<div class="admin-loading-placeholder">Memuat statistik...</div>';

  try {
    const result = await callApi('adminStats', {});

    if (!result.success) {
      main.innerHTML = `<div class="admin-error">Gagal load statistik: ${escapeHtml(result.error || 'Unknown')}</div>`;
      return;
    }

    const s = result.stats;
    State.statsCache = s;

    main.innerHTML = `
      <div class="admin-section">
        <h2 class="admin-section-title">📊 Statistik Ringkas</h2>
        <div class="admin-stats-grid">
          <div class="admin-stat-card">
            <div class="admin-stat-icon">👥</div>
            <div class="admin-stat-value">${s.total || 0}</div>
            <div class="admin-stat-label">Total User</div>
          </div>
          <div class="admin-stat-card">
            <div class="admin-stat-icon">✅</div>
            <div class="admin-stat-value">${s.used || 0}</div>
            <div class="admin-stat-label">Active</div>
          </div>
          <div class="admin-stat-card">
            <div class="admin-stat-icon">🆕</div>
            <div class="admin-stat-value">${s.unused || 0}</div>
            <div class="admin-stat-label">Unused</div>
          </div>
          <div class="admin-stat-card">
            <div class="admin-stat-icon">🚫</div>
            <div class="admin-stat-value">${s.revoked || 0}</div>
            <div class="admin-stat-label">Revoked</div>
          </div>
          <div class="admin-stat-card">
            <div class="admin-stat-icon">💎</div>
            <div class="admin-stat-value">${s.totalToken || 0}</div>
            <div class="admin-stat-label">Total Token</div>
          </div>
          <div class="admin-stat-card">
            <div class="admin-stat-icon">✨</div>
            <div class="admin-stat-value">${s.todayAI || 0}</div>
            <div class="admin-stat-label">AI Hari Ini</div>
          </div>
          <div class="admin-stat-card">
            <div class="admin-stat-icon">⏱️</div>
            <div class="admin-stat-value">${s.avgElapsed || 0}<span class="unit">ms</span></div>
            <div class="admin-stat-label">Avg Response</div>
          </div>
          <div class="admin-stat-card ${s.timeoutRate > 10 ? 'warning' : ''}">
            <div class="admin-stat-icon">⚠️</div>
            <div class="admin-stat-value">${s.timeoutRate || 0}<span class="unit">%</span></div>
            <div class="admin-stat-label">Timeout Rate</div>
          </div>
        </div>
      </div>

      <div class="admin-section">
        <h2 class="admin-section-title">⚡ Aksi Cepat</h2>
        <div class="admin-quick-actions">
          <button class="admin-quick-btn" data-action="goto-generate">
            <div class="admin-quick-icon">➕</div>
            <div class="admin-quick-text">
              <strong>Generate Password</strong>
              <small>Buat batch password baru</small>
            </div>
          </button>
          <button class="admin-quick-btn" data-action="goto-topup">
            <div class="admin-quick-icon">💎</div>
            <div class="admin-quick-text">
              <strong>Top-up Token</strong>
              <small>Tambah token user</small>
            </div>
          </button>
          <button class="admin-quick-btn" data-action="goto-users">
            <div class="admin-quick-icon">👥</div>
            <div class="admin-quick-text">
              <strong>Kelola User</strong>
              <small>Lihat, edit, revoke</small>
            </div>
          </button>
          <button class="admin-quick-btn" data-action="refresh-stats">
            <div class="admin-quick-icon">🔄</div>
            <div class="admin-quick-text">
              <strong>Refresh Stats</strong>
              <small>Muat ulang statistik</small>
            </div>
          </button>
        </div>
      </div>
    `;

    $$('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'goto-generate') {
          State.currentTab = 'generate';
          $$('.admin-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'generate'));
          renderTab('generate');
        } else if (action === 'goto-topup') {
          State.currentTab = 'topup';
          $$('.admin-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'topup'));
          renderTab('topup');
        } else if (action === 'goto-users') {
          State.currentTab = 'users';
          $$('.admin-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'users'));
          renderTab('users');
        } else if (action === 'refresh-stats') {
          renderTab('dashboard');
        }
      });
    });

  } catch (err) {
    main.innerHTML = `<div class="admin-error">Error: ${escapeHtml(err.message)}</div>`;
  }
}

/* ============================================================
   TAB: GENERATE PASSWORD
   ============================================================ */
function renderGenerateTab(main) {
  main.innerHTML = `
    <div class="admin-section">
      <h2 class="admin-section-title">➕ Generate Password</h2>
      <p class="admin-section-desc">Buat password baru untuk user. Password bisa di-copy atau download CSV.</p>

      <div class="admin-form-grid">
        <div class="form-field">
          <label class="form-label">Jumlah Password</label>
          <input type="number" id="genCount" class="form-input" value="10" min="1" max="100">
          <div class="form-hint">Max 100 per batch</div>
        </div>
        <div class="form-field">
          <label class="form-label">Paket</label>
          <select id="genPackage" class="form-input">
            <option value="starter">Starter (3 token)</option>
            <option value="core" selected>Core (10 token)</option>
            <option value="pro">Pro (30 token)</option>
            <option value="ultimate">Ultimate (80 token)</option>
            <option value="">Custom (0 token)</option>
          </select>
        </div>
      </div>

      <button class="btn btn-primary btn-lg" id="genBtn">Generate Sekarang</button>
    </div>

    <div class="admin-section" id="genResult" hidden>
      <h2 class="admin-section-title">✅ Hasil Generate</h2>
      <div class="admin-result-actions">
        <button class="btn btn-secondary btn-sm" id="genCopyAll">📋 Copy Semua</button>
        <button class="btn btn-secondary btn-sm" id="genDownloadCsv">📥 Download CSV</button>
      </div>
      <div class="admin-code-list" id="genCodes"></div>
    </div>
  `;

  $('#genBtn').addEventListener('click', async () => {
    const count = parseInt($('#genCount').value) || 10;
    const pkg = $('#genPackage').value;

    if (count < 1 || count > 100) {
      toast('Jumlah harus 1-100', 'warning');
      return;
    }

    showLoading(`Generate ${count} password...`);
    try {
      const result = await callApi('adminGenerate', { count, package: pkg });
      hideLoading();

      if (!result.success) {
        toast('Gagal: ' + (result.error || 'Unknown'), 'error', 5000);
        return;
      }

      State.lastGeneratedCodes = result.codes;

      const resultSection = $('#genResult');
      const codesList = $('#genCodes');

      codesList.innerHTML = result.codes.map((code, i) => `
        <div class="admin-code-item">
          <span class="admin-code-num">${i + 1}</span>
          <code class="admin-code-text">${escapeHtml(code)}</code>
          <button class="admin-code-copy" data-copy="${escapeHtml(code)}">📋</button>
        </div>
      `).join('');

      resultSection.hidden = false;
      toast(`✅ ${result.count} password berhasil di-generate`, 'success');

      codesList.querySelectorAll('[data-copy]').forEach(btn => {
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(btn.dataset.copy).then(() => {
            toast('Disalin: ' + btn.dataset.copy, 'success', 2000);
          });
        });
      });

    } catch (err) {
      hideLoading();
      toast('Error: ' + err.message, 'error', 5000);
    }
  });

  $('#genCopyAll')?.addEventListener('click', () => {
    if (!State.lastGeneratedCodes) return;
    navigator.clipboard.writeText(State.lastGeneratedCodes.join('\n')).then(() => {
      toast('Semua password disalin', 'success');
    });
  });

  $('#genDownloadCsv')?.addEventListener('click', () => {
    if (!State.lastGeneratedCodes) return;
    const csv = 'password\n' + State.lastGeneratedCodes.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zhenin-passwords-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('CSV downloaded', 'success');
  });
}

/* ============================================================
   TAB: TOP-UP
   ============================================================ */
function renderTopupTab(main) {
  main.innerHTML = `
    <div class="admin-section">
      <h2 class="admin-section-title">💎 Top-up Token</h2>
      <p class="admin-section-desc">Cari user by password, lalu tambahkan token.</p>

      <div class="admin-form-grid">
        <div class="form-field" style="grid-column: 1 / -1;">
          <label class="form-label">Password User</label>
          <input type="text" id="topupPassword" class="form-input" placeholder="USER-XXXX-XXXX" style="text-transform:uppercase;font-family:monospace;">
          <div class="form-hint">Format: USER-XXXX-XXXX</div>
        </div>
      </div>

      <button class="btn btn-secondary" id="topupSearchBtn">🔍 Cari User</button>

      <div id="topupUserInfo" hidden style="margin-top:16px;"></div>

      <div id="topupAmountSection" hidden style="margin-top:16px;">
        <div class="admin-form-grid">
          <div class="form-field">
            <label class="form-label">Jumlah Token</label>
            <input type="number" id="topupAmount" class="form-input" value="10" min="1" max="1000">
          </div>
        </div>
        <button class="btn btn-primary btn-lg" id="topupDoBtn">💎 Top-up Sekarang</button>
      </div>
    </div>
  `;

  const pwInput = $('#topupPassword');
  pwInput.addEventListener('input', () => {
    pwInput.value = pwInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  });

  $('#topupSearchBtn').addEventListener('click', async () => {
    const pw = pwInput.value.trim();
    if (!pw) { toast('Masukkan password', 'warning'); return; }

    showLoading('Mencari user...');
    try {
      const result = await callApi('adminSearch', { query: pw });
      hideLoading();

      if (!result.success || !result.results || result.results.length === 0) {
        toast('User tidak ditemukan', 'warning');
        $('#topupUserInfo').hidden = true;
        $('#topupAmountSection').hidden = true;
        return;
      }

      const user = result.results[0];
      State.topupUser = user;

      $('#topupUserInfo').innerHTML = `
        <div class="admin-user-card">
          <div class="admin-user-row">
            <span>Password:</span>
            <code>${escapeHtml(user.code)}</code>
          </div>
          <div class="admin-user-row">
            <span>Status:</span>
            <span class="admin-badge admin-badge-${user.status.toLowerCase()}">${user.status}</span>
          </div>
          <div class="admin-user-row">
            <span>Token:</span>
            <strong style="color:var(--z-gold);">${user.token}</strong>
          </div>
          <div class="admin-user-row">
            <span>Device:</span>
            <span>${user.deviceCount} / ${user.maxDevice}</span>
          </div>
        </div>
      `;
      $('#topupUserInfo').hidden = false;
      $('#topupAmountSection').hidden = false;

    } catch (err) {
      hideLoading();
      toast('Error: ' + err.message, 'error');
    }
  });

  $('#topupDoBtn').addEventListener('click', async () => {
    if (!State.topupUser) return;
    const amount = parseInt($('#topupAmount').value) || 0;
    if (amount < 1 || amount > 1000) {
      toast('Jumlah token 1-1000', 'warning');
      return;
    }

    showLoading(`Top-up ${amount} token...`);
    try {
      const result = await callApi('adminTopUp', {
        password: State.topupUser.code,
        amount: amount
      });
      hideLoading();

      if (result.success) {
        toast(`✅ Berhasil. Token baru: ${result.newToken}`, 'success', 4000);
        // Update UI
        State.topupUser.token = result.newToken;
        const tokenEl = $('#topupUserInfo strong');
        if (tokenEl) tokenEl.textContent = result.newToken;
      } else {
        toast('Gagal: ' + (result.error || 'Unknown'), 'error');
      }
    } catch (err) {
      hideLoading();
      toast('Error: ' + err.message, 'error');
    }
  });
}

/* ============================================================
   TAB: USERS
   ============================================================ */
function renderUsersTab(main) {
  main.innerHTML = `
    <div class="admin-section">
      <h2 class="admin-section-title">👥 Kelola User</h2>

      <div class="admin-users-toolbar">
        <input type="text" id="usersSearch" class="form-input admin-search-input" placeholder="🔍 Cari password...">
        <div class="admin-filter-group">
          <button class="admin-filter-btn active" data-filter="all">Semua</button>
          <button class="admin-filter-btn" data-filter="used">Used</button>
          <button class="admin-filter-btn" data-filter="unused">Unused</button>
          <button class="admin-filter-btn" data-filter="revoked">Revoked</button>
        </div>
      </div>

      <div id="usersList" class="admin-users-list">
        <div class="admin-loading-placeholder">Memuat...</div>
      </div>

      <div class="admin-pagination" id="usersPagination" hidden></div>
    </div>
  `;

  const searchInput = $('#usersSearch');
  searchInput.addEventListener('input', () => {
    if (State.searchTimer) clearTimeout(State.searchTimer);
    State.searchTimer = setTimeout(() => {
      loadUsers(1);
    }, 400);
  });

  $$('.admin-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.admin-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.currentFilter = btn.dataset.filter;
      loadUsers(1);
    });
  });

  loadUsers(1);
}

async function loadUsers(page = 1) {
  const listEl = $('#usersList');
  if (!listEl) return;

  const query = $('#usersSearch')?.value.trim() || '';
  const filter = State.currentFilter || 'all';

  listEl.innerHTML = '<div class="admin-loading-placeholder">Memuat...</div>';

  try {
    let result;
    if (query) {
      result = await callApi('adminSearch', { query });
    } else {
      result = await callApi('adminList', { page, limit: 20, filter });
    }

    let users = [];
    let pagination = null;

    if (query) {
      users = result.results || [];
    } else {
      users = result.items || [];
      pagination = result.pagination;
    }

    if (!users.length) {
      listEl.innerHTML = '<div class="admin-empty">Tidak ada user</div>';
      const pagEl = $('#usersPagination');
      if (pagEl) pagEl.hidden = true;
      return;
    }

    State.usersCache = users;

    listEl.innerHTML = users.map(u => `
      <div class="admin-user-item" data-user-code="${escapeHtml(u.code)}">
        <div class="admin-user-item-main">
          <div class="admin-user-item-code">${escapeHtml(u.code)}</div>
          <div class="admin-user-item-meta">
            <span class="admin-badge admin-badge-${u.status.toLowerCase()}">${u.status}</span>
            <span>💎 ${u.token}</span>
            <span>📱 ${u.deviceCount}/${u.maxDevice}</span>
            ${u.lastActive ? `<span>⏱ ${new Date(u.lastActive).toLocaleDateString('id-ID')}</span>` : ''}
          </div>
        </div>
        <button class="admin-user-item-menu" data-user-menu="${escapeHtml(u.code)}">⋯</button>
      </div>
    `).join('');

    // Bind actions
    listEl.querySelectorAll('[data-user-menu]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        showUserActions(btn.dataset.userMenu);
      });
    });

    // Pagination
    if (pagination && pagination.totalPages > 1) {
      const pagEl = $('#usersPagination');
      if (pagEl) {
        pagEl.hidden = false;
        let html = '<div class="admin-pagination-buttons">';
        if (pagination.page > 1) {
          html += `<button class="btn btn-sm btn-secondary" data-page="${pagination.page - 1}">← Prev</button>`;
        }
        html += `<span class="admin-pagination-info">Hal ${pagination.page} / ${pagination.totalPages} · ${pagination.total} user</span>`;
        if (pagination.page < pagination.totalPages) {
          html += `<button class="btn btn-sm btn-secondary" data-page="${pagination.page + 1}">Next →</button>`;
        }
        html += '</div>';
        pagEl.innerHTML = html;

        pagEl.querySelectorAll('[data-page]').forEach(b => {
          b.addEventListener('click', () => loadUsers(parseInt(b.dataset.page)));
        });
      }
    } else {
      const pagEl = $('#usersPagination');
      if (pagEl) pagEl.hidden = true;
    }

  } catch (err) {
    listEl.innerHTML = `<div class="admin-error">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function showUserActions(code) {
  const user = State.usersCache.find(u => u.code === code);
  if (!user) return;

  const actions = `
    <div class="admin-modal-overlay" id="userActionModal">
      <div class="admin-modal">
        <div class="admin-modal-header">
          <h3>User: ${escapeHtml(user.code)}</h3>
          <button class="icon-btn" onclick="document.getElementById('userActionModal').remove()">×</button>
        </div>
        <div class="admin-modal-body">
          <div class="admin-user-detail">
            <div class="admin-user-row"><span>Status:</span><span class="admin-badge admin-badge-${user.status.toLowerCase()}">${user.status}</span></div>
            <div class="admin-user-row"><span>Token:</span><strong style="color:var(--z-gold);">${user.token}</strong></div>
            <div class="admin-user-row"><span>Device:</span><span>${user.deviceCount} / ${user.maxDevice}</span></div>
            <div class="admin-user-row"><span>Used at:</span><span>${user.usedAt ? new Date(user.usedAt).toLocaleString('id-ID') : '-'}</span></div>
            <div class="admin-user-row"><span>Last active:</span><span>${user.lastActive ? new Date(user.lastActive).toLocaleString('id-ID') : '-'}</span></div>
          </div>

          <div class="admin-action-buttons">
            <button class="btn btn-secondary" data-act="topup">💎 Top-up</button>
            <button class="btn btn-secondary" data-act="reset-device">🔄 Reset Device</button>
            <button class="btn ${user.status === 'REVOKED' ? 'btn-primary' : 'btn-danger'}" data-act="toggle-revoke">
              ${user.status === 'REVOKED' ? '✅ Unrevoke' : '🚫 Revoke'}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', actions);

  const modal = $('#userActionModal');
  modal.querySelector('[data-act="topup"]').addEventListener('click', () => {
    const amount = prompt('Jumlah token untuk ditambahkan:', '10');
    if (!amount) return;
    const num = parseInt(amount);
    if (isNaN(num) || num < 1) return;
    doTopup(user.code, num).then(() => modal.remove());
  });

  modal.querySelector('[data-act="reset-device"]').addEventListener('click', () => {
    if (!confirm(`Reset device untuk ${user.code}?`)) return;
    doResetDevice(user.code).then(() => modal.remove());
  });

  modal.querySelector('[data-act="toggle-revoke"]').addEventListener('click', () => {
    const isRevoke = user.status !== 'REVOKED';
    if (!confirm(`${isRevoke ? 'Revoke' : 'Unrevoke'} ${user.code}?`)) return;
    doToggleRevoke(user.code, isRevoke).then(() => modal.remove());
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

async function doTopup(code, amount) {
  showLoading('Top-up...');
  try {
    const result = await callApi('adminTopUp', { password: code, amount });
    hideLoading();
    if (result.success) {
      toast(`✅ ${code} +${amount} token. Total: ${result.newToken}`, 'success', 4000);
      loadUsers();
    } else {
      toast('Gagal: ' + result.error, 'error');
    }
  } catch (err) {
    hideLoading();
    toast('Error: ' + err.message, 'error');
  }
}

async function doResetDevice(code) {
  showLoading('Reset device...');
  try {
    const result = await callApi('adminReset', { password: code });
    hideLoading();
    if (result.success) {
      toast(`✅ Device reset: ${code}`, 'success');
      loadUsers();
    } else {
      toast('Gagal: ' + result.error, 'error');
    }
  } catch (err) {
    hideLoading();
    toast('Error: ' + err.message, 'error');
  }
}

async function doToggleRevoke(code, revoke) {
  showLoading(revoke ? 'Revoke...' : 'Unrevoke...');
  try {
    const result = await callApi('adminRevoke', { password: code, revoke });
    hideLoading();
    if (result.success) {
      toast(`✅ ${code} → ${result.status}`, 'success');
      loadUsers();
    } else {
      toast('Gagal: ' + result.error, 'error');
    }
  } catch (err) {
    hideLoading();
    toast('Error: ' + err.message, 'error');
  }
}

/* ============================================================
   TAB: TEMPLATES
   ============================================================ */
async function renderTemplatesTab(main) {
  main.innerHTML = '<div class="admin-loading-placeholder">Memuat templates...</div>';

  try {
    const result = await callApi('getTemplates', {});
    const templates = result.templates || {};

    main.innerHTML = `
      <div class="admin-section">
        <h2 class="admin-section-title">⚙️ Templates & AI Config</h2>
        <p class="admin-section-desc">Edit struktur LP/Askep dan config AI. Perubahan langsung aktif tanpa deploy ulang.</p>

        <div class="admin-form-grid-1">
          <div class="form-field">
            <label class="form-label">AI Model</label>
            <select id="tpl_ai_model" class="form-input">
              <option value="gemini-3.1-flash-lite" ${templates.ai_model === 'gemini-3.1-flash-lite' ? 'selected' : ''}>gemini-3.1-flash-lite (recommended)</option>
              <option value="gemini-3.5-flash" ${templates.ai_model === 'gemini-3.5-flash' ? 'selected' : ''}>gemini-3.5-flash</option>
              <option value="gemini-3.5-flash-lite" ${templates.ai_model === 'gemini-3.5-flash-lite' ? 'selected' : ''}>gemini-3.5-flash-lite</option>
              <option value="gemini-3-flash-preview" ${templates.ai_model === 'gemini-3-flash-preview' ? 'selected' : ''}>gemini-3-flash-preview</option>
              <option value="gemini-flash-latest" ${templates.ai_model === 'gemini-flash-latest' ? 'selected' : ''}>gemini-flash-latest</option>
              <option value="gemini-flash-lite-latest" ${templates.ai_model === 'gemini-flash-lite-latest' ? 'selected' : ''}>gemini-flash-lite-latest</option>
            </select>
          </div>

          <div class="form-field">
            <label class="form-label">Temperature (0.0 - 1.0)</label>
            <input type="number" id="tpl_ai_temperature" class="form-input" value="${escapeHtml(templates.ai_temperature || '0.7')}" step="0.1" min="0" max="1">
            <div class="form-hint">0 = fokus, 1 = kreatif</div>
          </div>

          <div class="form-field">
            <label class="form-label">Max Output Tokens</label>
            <input type="number" id="tpl_ai_max_tokens" class="form-input" value="${escapeHtml(templates.ai_max_tokens || '8192')}" step="512" min="1024" max="8192">
          </div>

          <div class="form-field">
            <label class="form-label">LP Structure</label>
            <textarea id="tpl_lp_structure" class="form-input form-textarea-lg" rows="8">${escapeHtml(templates.lp_structure || '')}</textarea>
          </div>

          <div class="form-field">
            <label class="form-label">Askep Structure</label>
            <textarea id="tpl_askep_structure" class="form-input form-textarea-lg" rows="8">${escapeHtml(templates.askep_structure || '')}</textarea>
          </div>
        </div>

        <button class="btn btn-primary btn-lg" id="tplSaveBtn">💾 Simpan Perubahan</button>
      </div>
    `;

    $('#tplSaveBtn').addEventListener('click', async () => {
      const session = AdminAuth.getSession();
      if (!session) { toast('Session invalid', 'error'); return; }

      const payload = {
        adminToken: session.password,
        templates: {
          ai_model: $('#tpl_ai_model').value,
          ai_temperature: $('#tpl_ai_temperature').value,
          ai_max_tokens: $('#tpl_ai_max_tokens').value,
          lp_structure: $('#tpl_lp_structure').value,
          askep_structure: $('#tpl_askep_structure').value
        }
      };

      showLoading('Menyimpan templates...');
      try {
        const result = await callApi('saveTemplates', payload);
        hideLoading();
        if (result.success) {
          toast(`✅ Templates disimpan (${result.updated || 0} updated, ${result.added || 0} added)`, 'success', 4000);
        } else {
          toast('Gagal: ' + (result.error || 'Unknown'), 'error', 5000);
        }
      } catch (err) {
        hideLoading();
        toast('Error: ' + err.message, 'error');
      }
    });

  } catch (err) {
    main.innerHTML = `<div class="admin-error">Error: ${escapeHtml(err.message)}</div>`;
  }
}

/* ============================================================
   TAB: SETTINGS (Contact, Pricing, Promo)
   ============================================================ */
async function renderSettingsTab(main) {
  main.innerHTML = '<div class="admin-loading-placeholder">Memuat settings...</div>';

  try {
    const [contactRes, pricingRes, promoRes] = await Promise.all([
      callApi('getContact', {}),
      callApi('getPricing', {}),
      callApi('getPromo', {})
    ]);

    const contact = contactRes.contact || {};
    const pricing = pricingRes.pricing || [];
    const promo = promoRes || {};

    main.innerHTML = `
      <div class="admin-section">
        <h2 class="admin-section-title">📞 Kontak Admin</h2>
        <div class="admin-form-grid">
          <div class="form-field">
            <label class="form-label">Nama Admin</label>
            <input type="text" id="st_contact_name" class="form-input" value="${escapeHtml(contact.name || '')}">
          </div>
          <div class="form-field">
            <label class="form-label">WhatsApp</label>
            <input type="text" id="st_contact_wa" class="form-input" value="${escapeHtml(contact.wa || '')}" placeholder="6289xxx">
          </div>
          <div class="form-field" style="grid-column: 1 / -1;">
            <label class="form-label">Jam Operasional</label>
            <input type="text" id="st_contact_hours" class="form-input" value="${escapeHtml(contact.hours || '')}">
          </div>
          <div class="form-field" style="grid-column: 1 / -1;">
            <label class="form-label">Catatan</label>
            <input type="text" id="st_contact_note" class="form-input" value="${escapeHtml(contact.note || '')}">
          </div>
        </div>
      </div>

      <div class="admin-section">
        <h2 class="admin-section-title">💎 Pricing (Token)</h2>
        <div id="pricingList"></div>
        <div class="admin-pricing-actions">
          <button class="btn btn-secondary" id="addPricingBtn">+ Tambah Paket</button>
          <button class="btn btn-primary" id="savePricingBtn">💾 Simpan Pricing</button>
        </div>
      </div>

      <div class="admin-section">
        <h2 class="admin-section-title">🎉 Promo Banner</h2>
        <div class="admin-form-grid">
          <div class="form-field">
            <label class="form-label">Status</label>
            <select id="st_promo_active" class="form-input">
              <option value="FALSE" ${!promo.active ? 'selected' : ''}>Nonaktif</option>
              <option value="TRUE" ${promo.active ? 'selected' : ''}>Aktif</option>
            </select>
          </div>
          <div class="form-field">
            <label class="form-label">Icon</label>
            <input type="text" id="st_promo_icon" class="form-input" value="${escapeHtml(promo.icon || '🎉')}" maxlength="2">
          </div>
          <div class="form-field">
            <label class="form-label">Warna</label>
            <select id="st_promo_color" class="form-input">
              <option value="purple" ${promo.color === 'purple' ? 'selected' : ''}>Purple</option>
              <option value="gold" ${promo.color === 'gold' ? 'selected' : ''}>Gold</option>
              <option value="crimson" ${promo.color === 'crimson' ? 'selected' : ''}>Crimson</option>
            </select>
          </div>
          <div class="form-field" style="grid-column: 1 / -1;">
            <label class="form-label">Text Promo</label>
            <input type="text" id="st_promo_text" class="form-input" value="${escapeHtml(promo.text || '')}" placeholder="Diskon 20% paket Ultimate!">
          </div>
        </div>
      </div>

      <div class="admin-section">
        <button class="btn btn-primary btn-lg" id="settingsSaveBtn">💾 Simpan Semua Settings</button>
      </div>
    `;

    // Render pricing list
    renderPricingList(pricing);

    $('#addPricingBtn').addEventListener('click', () => {
      const container = $('#pricingList');
      const newItem = document.createElement('div');
      newItem.className = 'admin-pricing-item';
      newItem.innerHTML = `
        <input type="text" class="form-input" placeholder="Nama" value="">
        <input type="number" class="form-input" placeholder="Harga" value="0">
        <input type="number" class="form-input" placeholder="Token" value="0">
        <select class="form-input">
          <option value="FALSE">Normal</option>
          <option value="TRUE">Popular ⭐</option>
        </select>
        <button class="btn btn-danger btn-sm" data-remove>×</button>
      `;
      container.appendChild(newItem);
      newItem.querySelector('[data-remove]').addEventListener('click', () => newItem.remove());
    });

    $('#savePricingBtn').addEventListener('click', savePricing);
    $('#settingsSaveBtn').addEventListener('click', saveAllSettings);

  } catch (err) {
    main.innerHTML = `<div class="admin-error">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function renderPricingList(pricing) {
  const container = $('#pricingList');
  if (!container) return;

  if (!pricing.length) {
    container.innerHTML = '<div class="admin-empty">Belum ada paket</div>';
    return;
  }

  container.innerHTML = pricing.map(p => `
    <div class="admin-pricing-item">
      <input type="text" class="form-input" placeholder="Nama" value="${escapeHtml(p.package)}">
      <input type="number" class="form-input" placeholder="Harga" value="${p.price}">
      <input type="number" class="form-input" placeholder="Token" value="${p.token}">
      <select class="form-input">
        <option value="FALSE" ${!p.popular ? 'selected' : ''}>Normal</option>
        <option value="TRUE" ${p.popular ? 'selected' : ''}>Popular ⭐</option>
      </select>
      <button class="btn btn-danger btn-sm" data-remove>×</button>
    </div>
  `).join('');

  container.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.admin-pricing-item').remove());
  });
}

async function savePricing() {
  const session = AdminAuth.getSession();
  if (!session) return;

  const items = $$('#pricingList .admin-pricing-item');
  const pricing = [];

  items.forEach(item => {
    const inputs = item.querySelectorAll('input, select');
    pricing.push({
      package: inputs[0].value.trim(),
      price: parseInt(inputs[1].value) || 0,
      token: parseInt(inputs[2].value) || 0,
      popular: inputs[3].value === 'TRUE'
    });
  });

  showLoading('Menyimpan pricing...');
  try {
    const result = await callApi('adminSavePricing', {
      adminToken: session.password,
      pricing
    });
    hideLoading();
    if (result.success) {
      toast(`✅ Pricing disimpan (${result.count} paket)`, 'success');
    } else {
      toast('Gagal: ' + (result.error || 'Unknown'), 'error', 5000);
    }
  } catch (err) {
    hideLoading();
    toast('Error: ' + err.message, 'error');
  }
}

async function saveAllSettings() {
  const session = AdminAuth.getSession();
  if (!session) return;

  const contact = {
    contact_name: $('#st_contact_name').value.trim(),
    contact_wa: $('#st_contact_wa').value.trim(),
    contact_hours: $('#st_contact_hours').value.trim(),
    contact_note: $('#st_contact_note').value.trim()
  };

  const promo = {
    active: $('#st_promo_active').value === 'TRUE',
    icon: $('#st_promo_icon').value.trim(),
    color: $('#st_promo_color').value,
    text: $('#st_promo_text').value.trim()
  };

  showLoading('Menyimpan settings...');
  try {
    // Save contact
    const contactRes = await callApi('adminSaveConfig', {
      adminToken: session.password,
      config: contact
    });

    // Save promo
    const promoRes = await callApi('adminSavePromo', {
      adminToken: session.password,
      promo
    });

    // Save pricing juga
    await savePricing();

    hideLoading();
    toast('✅ Semua settings disimpan', 'success', 4000);

  } catch (err) {
    hideLoading();
    toast('Error: ' + err.message, 'error');
  }
}

/* ============================================================
   INIT ADMIN
   ============================================================ */
function initAdmin() {
  if (AdminAuth.isLoggedIn()) {
    State.session = AdminAuth.getSession();
    renderAdminDashboard();
  } else {
    renderAdminLogin();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdmin);
} else {
  initAdmin();
}