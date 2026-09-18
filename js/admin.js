/* ============================================================
   ZHENIN - Admin Module (Loaded dynamically)
   ============================================================ */

import { CONFIG } from './config.js';
import { Data, Storage } from './storage.js';

/* ============================================================
   ADMIN AUTH
   ============================================================ */
const AdminAuth = {
  async login(password) {
    if (!password || !password.trim()) {
      return { success: false, error: 'Password tidak boleh kosong' };
    }
    
    if (!CONFIG.APPS_SCRIPT_URL) {
      return { success: false, error: 'Backend belum dikonfigurasi' };
    }
    
    try {
      const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'adminLogin',
          password: password.trim()
        })
      });
      
      const result = await response.json();
      
      if (!result.valid) {
        return { success: false, error: result.message || 'Login gagal' };
      }
      
      // Save admin session
      const session = {
        token: result.sessionToken,
        loginAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 jam
      };
      Data.saveAdminSession(session);
      
      return { success: true, session };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
  
  logout() {
    Data.clearAdminSession();
  },
  
  isLoggedIn() {
    return !!Data.getAdminSession();
  }
};

/* ============================================================
   ADMIN UI
   ============================================================ */
function renderAdminLogin() {
  const root = document.getElementById('adminRoot');
  if (!root) return;
  
  root.innerHTML = `
    <div class="screen-login" style="min-height:100vh;">
      <div class="login-container">
        <div class="login-header">
          <div class="login-logo">
            <svg viewBox="0 0 100 100" fill="none">
              <path d="M50 15 L85 50 L50 85 L15 50 Z" stroke="#C9A961" stroke-width="2" fill="none"/>
              <circle cx="50" cy="50" r="8" fill="#6B3FA0" stroke="#C9A961" stroke-width="2"/>
            </svg>
          </div>
          <h1 class="login-title">ADMIN</h1>
          <p class="login-subtitle">Akses terbatas</p>
        </div>

        <form class="login-form" id="adminLoginForm">
          <div class="form-field">
            <label class="form-label">Password Admin</label>
            <input type="password" class="form-input" id="adminPassword" placeholder="••••••••" autocomplete="off" required>
          </div>
          <button type="submit" class="btn btn-primary btn-block btn-lg" id="adminLoginBtn">
            <span class="btn-text">Login Admin</span>
            <span class="btn-spinner" hidden></span>
          </button>
        </form>

        <div class="login-help" style="margin-top:24px;">
          <a href="/" class="link-btn">← Kembali ke aplikasi</a>
        </div>

        <div class="login-footer">
          <div class="login-version">v${CONFIG.APP_VERSION} · Admin Panel</div>
        </div>
      </div>
    </div>
  `;
  
  document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('adminLoginBtn');
    const input = document.getElementById('adminPassword');
    const password = input.value;
    
    btn.disabled = true;
    btn.querySelector('.btn-spinner').hidden = false;
    
    const result = await AdminAuth.login(password);
    
    btn.disabled = false;
    btn.querySelector('.btn-spinner').hidden = true;
    
    if (result.success) {
      renderAdminDashboard();
    } else {
      alert('Login gagal: ' + result.error);
      input.select();
    }
  });
}

function renderAdminDashboard() {
  const root = document.getElementById('adminRoot');
  if (!root) return;
  
  root.innerHTML = `
    <div class="app-header" style="position:relative;">
      <div class="app-header-left">
        <div class="user-avatar" style="background:linear-gradient(135deg,#8B0000,#4A2C5A);">A</div>
        <div class="user-info">
          <div class="user-greeting">Admin Panel</div>
          <div class="user-name">Zhenin</div>
        </div>
      </div>
      <button class="icon-btn" id="adminLogoutBtn" title="Logout">🚪</button>
    </div>

    <div style="padding:20px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
        <div style="padding:16px;background:var(--z-surface);border:1px solid var(--z-border);border-radius:12px;">
          <div style="font-size:11px;color:var(--z-text-muted);letter-spacing:1px;">TOTAL USER</div>
          <div style="font-family:'Cinzel',serif;font-size:28px;color:var(--z-gold);" id="statTotal">-</div>
        </div>
        <div style="padding:16px;background:var(--z-surface);border:1px solid var(--z-border);border-radius:12px;">
          <div style="font-size:11px;color:var(--z-text-muted);letter-spacing:1px;">ACTIVE</div>
          <div style="font-family:'Cinzel',serif;font-size:28px;color:var(--z-gold);" id="statActive">-</div>
        </div>
        <div style="padding:16px;background:var(--z-surface);border:1px solid var(--z-border);border-radius:12px;">
          <div style="font-size:11px;color:var(--z-text-muted);letter-spacing:1px;">TOTAL TOKEN</div>
          <div style="font-family:'Cinzel',serif;font-size:28px;color:var(--z-gold);" id="statTokenAdmin">-</div>
        </div>
        <div style="padding:16px;background:var(--z-surface);border:1px solid var(--z-border);border-radius:12px;">
          <div style="font-size:11px;color:var(--z-text-muted);letter-spacing:1px;">AI HARI INI</div>
          <div style="font-family:'Cinzel',serif;font-size:28px;color:var(--z-gold);" id="statAiToday">-</div>
        </div>
      </div>

      <h3 style="font-family:'Cinzel',serif;color:var(--z-gold);font-size:14px;letter-spacing:1px;margin-bottom:12px;">AKSI CEPAT</h3>

      <div style="display:flex;flex-direction:column;gap:8px;">
        <button class="menu-item" data-admin-action="generate">
          <div class="menu-item-icon">➕</div>
          <div class="menu-item-content">
            <div class="menu-item-title">Generate Password</div>
            <div class="menu-item-sub">Buat batch password baru</div>
          </div>
          <div class="menu-item-arrow">→</div>
        </button>
        <button class="menu-item" data-admin-action="topup">
          <div class="menu-item-icon">💎</div>
          <div class="menu-item-content">
            <div class="menu-item-title">Top-up Token</div>
            <div class="menu-item-sub">Tambah token user</div>
          </div>
          <div class="menu-item-arrow">→</div>
        </button>
        <button class="menu-item" data-admin-action="reset">
          <div class="menu-item-icon">🔄</div>
          <div class="menu-item-content">
            <div class="menu-item-title">Reset Device</div>
            <div class="menu-item-sub">Reset device binding user</div>
          </div>
          <div class="menu-item-arrow">→</div>
        </button>
        <button class="menu-item" data-admin-action="stats">
          <div class="menu-item-icon">📊</div>
          <div class="menu-item-content">
            <div class="menu-item-title">Refresh Stats</div>
            <div class="menu-item-sub">Muat ulang statistik</div>
          </div>
          <div class="menu-item-arrow">→</div>
        </button>
      </div>
    </div>
  `;
  
  document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    AdminAuth.logout();
    renderAdminLogin();
  });
  
  // Load stats
  loadAdminStats();
  
  // Action handlers
  document.querySelectorAll('[data-admin-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.adminAction;
      alert(`Fitur "${action}" akan lengkap di Sprint 2E.\n\nUntuk Sprint 2A, fokus pada setup backend & login flow.`);
    });
  });
}

async function loadAdminStats() {
  if (!CONFIG.APPS_SCRIPT_URL) return;
  
  try {
    const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'adminStats' })
    });
    
    const result = await response.json();
    
    if (result.success) {
      document.getElementById('statTotal').textContent = result.stats.total || 0;
      document.getElementById('statActive').textContent = result.stats.used || 0;
      document.getElementById('statTokenAdmin').textContent = result.stats.totalToken || 0;
      document.getElementById('statAiToday').textContent = result.stats.todayAI || 0;
    }
  } catch (err) {
    console.error('Load stats error:', err);
  }
}

/* ============================================================
   INIT ADMIN
   ============================================================ */
function initAdmin() {
  if (AdminAuth.isLoggedIn()) {
    renderAdminDashboard();
  } else {
    renderAdminLogin();
  }
}

// Start
initAdmin();