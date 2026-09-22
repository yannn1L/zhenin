/* ============================================================
   ZHENIN - AI Module (v2.9.0 MODIFIED)
   Multi-step flow: Outline → Confirm → Full Generate

   CHANGELOG:
   - ADD: requestOutline() — buat outline (gratis)
   - ADD: requestFullGenerate() — generate full (1 token)
   - ADD: cacheOutline() / clearOutlineCache()
   - ADD: Image support di collectFormData()
   - MOD: saveResult() support partial flag
   - REMOVE: generate() lama (digantikan 2 method baru)
   ============================================================ */

import { CONFIG } from './config.js';
import { Data, StorageMonitor } from './storage.js';
import TokenManager from './token-manager.js';
import ImageHandler from './image-handler.js';

export const AI = {
  _currentRequest: null,
  _abortController: null,
  _loadingTextTimer: null,
  _loadingTimerInterval: null,
  _loadingStartTime: null,
  _currentDocId: null,
  _busyCooldownUntil: 0,
  _busyCooldownTimer: null,
  _resultCache: new Map(),
  _statusCache: null,
  _statusCacheTime: 0,
  _statusInterval: null,
  _statusRequestId: 0,

  // ⚠️ Outline cache
  _cachedOutline: null,
  _cachedOutlineKey: null,

  STATUS_CACHE_TTL: 30000,

  LOADING_MESSAGES: [
    'Menganalisis topik...',
    'Menghubungkan ke AI...',
    'Menyusun struktur dokumen...',
    'Menulis BAB I...',
    'Menyusun konsep penyakit...',
    'Membuat patofisiologi...',
    'Menyusun pemeriksaan...',
    'Membuat diagnosis keperawatan...',
    'Menyusun intervensi...',
    'Membuat implementasi...',
    'Menyusun evaluasi...',
    'Memformat tabel...',
    'Merapikan dokumen...',
    'Finalisasi...'
  ],

  initAIScreen() {
    const form = document.getElementById('aiForm');
    if (form && !form.dataset.bound) {
      form.dataset.bound = '1';

      form.addEventListener('click', (e) => {
        const toggle = e.target.closest('#patientToggle');
        if (toggle) {
          e.preventDefault();
          this.togglePatientSection();
          return;
        }

        const typeOpt = e.target.closest('.type-option');
        if (typeOpt) {
          this.setType(typeOpt.dataset.type);
          return;
        }

        const promptOpt = e.target.closest('.prompt-option');
        if (promptOpt) {
          this.setPromptMode(promptOpt.dataset.mode);
          return;
        }

        if (e.target.closest('#btnTopicSuggest')) {
          e.preventDefault();
          if (window.showTopicSuggestions) window.showTopicSuggestions();
          return;
        }

        if (e.target.closest('#btnAiHelp')) {
          e.preventDefault();
          if (window.UI) window.UI.openModal('modalHelp');
          return;
        }
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (window.handleAISubmit) window.handleAISubmit(e);
      });
    }

    this.refreshUserStatus();

    if (this._statusInterval) clearInterval(this._statusInterval);
    this._statusInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.refreshUserStatus(true);
      }
    }, 60000);
  },

  togglePatientSection() {
    const toggle = document.getElementById('patientToggle');
    const body = document.getElementById('patientBody');
    if (!toggle || !body) return;

    const isCurrentlyVisible = body.style.display === 'block';

    if (isCurrentlyVisible) {
      body.style.display = 'none';
      body.hidden = true;
      toggle.classList.remove('open');
    } else {
      body.hidden = false;
      body.style.display = 'block';
      toggle.classList.add('open');
    }
  },

  setType(type) {
    if (!['lp', 'askep'].includes(type)) return;
    document.querySelectorAll('.type-option').forEach(b => {
      b.classList.toggle('active', b.dataset.type === type);
    });
    const hidden = document.getElementById('aiType');
    if (hidden) hidden.value = type;
  },

  setPromptMode(mode) {
    if (!['template', 'custom'].includes(mode)) return;
    document.querySelectorAll('.prompt-option').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    const hidden = document.getElementById('aiMode');
    if (hidden) hidden.value = mode;

    const customSection = document.getElementById('customPromptSection');
    if (customSection) customSection.hidden = mode !== 'custom';
  },

  /**
   * Refresh user status
   */
  async refreshUserStatus(silent = true) {
    const now = Date.now();
    if (this._statusCache && (now - this._statusCacheTime) < this.STATUS_CACHE_TTL) {
      this.renderUserStatus(this._statusCache);
      return this._statusCache;
    }

    const session = Data.getSession();
    if (!session) return null;

    const requestId = ++this._statusRequestId;

    try {
      const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'getUserStatus',
          password: session.password,
          deviceHash: session.deviceHash
        })
      });

      const result = await response.json();

      if (requestId !== this._statusRequestId) return null;

      if (result.success) {
        this._statusCache = result.status;
        this._statusCacheTime = Date.now();

        if (typeof result.status.token === 'number') {
          TokenManager.updateFromResponse(result.status.token);
        }

        this.renderUserStatus(result.status);
        return result.status;
      }
    } catch (err) {
      if (!silent) console.warn('[AI] Status fetch error:', err.message);
    }

    return null;
  },

  renderUserStatus(status) {
    if (!status) return;

    const homeEl = document.getElementById('dailyQuotaHome');
    if (homeEl) {
      homeEl.innerHTML = this.buildQuotaHTML(status);
      homeEl.hidden = false;
    }

    const aiEl = document.getElementById('dailyQuotaAI');
    if (aiEl) {
      aiEl.innerHTML = this.buildQuotaHTML(status);
      aiEl.hidden = false;
    }

    const costRemaining = document.getElementById('costRemaining');
    if (costRemaining) costRemaining.textContent = status.token;

    const genBtn = document.getElementById('btnGenerate');
    if (genBtn) {
      if (status.remaining === 0) {
        genBtn.disabled = true;
        genBtn.title = 'Kuota AI hari ini habis';
      } else if (this._busyCooldownUntil > Date.now()) {
        genBtn.disabled = true;
        genBtn.title = 'Server AI sibuk, tunggu beberapa detik';
      } else {
        genBtn.disabled = false;
        genBtn.title = '';
      }
    }
  },

  buildQuotaHTML(status) {
    const dailyPct = status.dailyLimit > 0
      ? Math.min(100, (status.dailyUsed / status.dailyLimit) * 100)
      : 0;

    let barClass = '';
    if (dailyPct >= 80) barClass = 'error';
    else if (dailyPct >= 50) barClass = 'warning';

    const remaining = Math.max(0, status.dailyLimit - status.dailyUsed);

    return `
      <div class="quota-card">
        <div class="quota-header">
          <span class="quota-title">📊 Kuota AI Hari Ini</span>
          <span class="quota-badge ${remaining === 0 ? 'empty' : ''}">
            ${remaining > 0 ? remaining + ' sisa' : 'HABIS'}
          </span>
        </div>
        <div class="quota-numbers">
          <span class="quota-used">${status.dailyUsed}</span>
          <span class="quota-sep">/</span>
          <span class="quota-limit">${status.dailyLimit}</span>
        </div>
        <div class="quota-progress">
          <div class="quota-progress-bar ${barClass}" style="width:${dailyPct}%"></div>
        </div>
        <div class="quota-info">
          <span>⏱️ Per jam: ${status.hourlyUsed}/${status.hourlyLimit}</span>
          <span>💎 Token: ${status.token}</span>
        </div>
      </div>
    `;
  },

  validateForm(formData) {
    const { topic, mode, customPrompt, type } = formData;

    if (!type || !['lp', 'askep'].includes(type)) {
      return { valid: false, error: 'Pilih jenis dokumen' };
    }

    if (mode === 'custom') {
      if (!customPrompt || customPrompt.trim().length < 10) {
        return { valid: false, error: 'Prompt custom minimal 10 karakter' };
      }
      if (customPrompt.length > CONFIG.LIMITS.PROMPT_MAX) {
        return { valid: false, error: 'Prompt terlalu panjang (max ' + CONFIG.LIMITS.PROMPT_MAX + ' char)' };
      }
    } else {
      if (!topic || topic.trim().length < 3) {
        return { valid: false, error: 'Topik minimal 3 karakter' };
      }
      if (topic.length > CONFIG.LIMITS.TOPIC_MAX) {
        return { valid: false, error: 'Topik terlalu panjang (max ' + CONFIG.LIMITS.TOPIC_MAX + ' char)' };
      }
    }

    return { valid: true };
  },

  /**
   * Collect form data + images
   */
  collectFormData() {
    const type = document.getElementById('aiType')?.value || 'askep';
    const topic = document.getElementById('aiTopic')?.value.trim() || '';
    const mode = document.getElementById('aiMode')?.value || 'template';
    const customPrompt = document.getElementById('aiCustomPrompt')?.value.trim() || '';

    const patient = {
      nama: document.getElementById('pName')?.value.trim() || '',
      umur: document.getElementById('pAge')?.value.trim() || '',
      gender: document.getElementById('pGender')?.value || '',
      room: document.getElementById('pRoom')?.value.trim() || '',
      dx: document.getElementById('pDx')?.value.trim() || '',
      complaint: document.getElementById('pComplaint')?.value.trim() || '',
      detail: document.getElementById('pDetail')?.value.trim() || ''
    };

    // ⚠️ Collect images from ImageHandler
    const images = ImageHandler.getImagesForAPI();

    return { type, topic, mode, customPrompt, patient, images };
  },

  buildPrompt(formData) {
    const { type, topic, mode, customPrompt, patient } = formData;
    if (mode === 'custom') return customPrompt;

    const typeLabel = type === 'lp' ? 'Laporan Pendahuluan (LP)' : 'Asuhan Keperawatan (Askep)';
    let prompt = 'Buatkan ' + typeLabel + ' tentang "' + topic + '"';

    const hasPatientData = Object.values(patient).some(v => v && v.trim());
    if (hasPatientData) {
      prompt += '\n\nData Pasien:';
      if (patient.nama) prompt += '\n- Nama: ' + patient.nama;
      if (patient.umur) prompt += '\n- Umur: ' + patient.umur + ' tahun';
      if (patient.gender) prompt += '\n- Jenis Kelamin: ' + patient.gender;
      if (patient.room) prompt += '\n- Ruang Rawat: ' + patient.room;
      if (patient.dx) prompt += '\n- Dx. Medis: ' + patient.dx;
      if (patient.complaint) prompt += '\n- Keluhan Utama: ' + patient.complaint;
      if (patient.detail) prompt += '\n- Detail Tambahan: ' + patient.detail;
    } else {
      prompt += '\n\nGunakan data pasien yang realistis dan umum untuk kasus ini.';
    }

    if (type === 'askep') {
      prompt += '\n\nSertakan implementasi dan evaluasi 3 hari (SOAP).';
    }

    return prompt;
  },

  /**
   * ⚠️ NEW: Build cache key
   */
  buildCacheKey(formData, prompt) {
    const key = formData.type + '|' + (formData.topic || formData.customPrompt) + '|' + (formData.images.length || 0);
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return 'ai_' + hash;
  },

  /**
   * ⚠️ NEW: Request outline (gratis, throttled 30s di backend)
   */
  async requestOutline() {
    const now = Date.now();
    if (this._busyCooldownUntil > now) {
      const waitSec = Math.ceil((this._busyCooldownUntil - now) / 1000);
      const error = new Error('Server AI sedang sibuk. Tunggu ' + waitSec + ' detik lagi.');
      error.code = 'BUSY_COOLDOWN';
      error.waitSec = waitSec;
      throw error;
    }

    const formData = this.collectFormData();
    const validation = this.validateForm(formData);
    if (!validation.valid) throw new Error(validation.error);

    const prompt = this.buildPrompt(formData);
    const cacheKey = this.buildCacheKey(formData, prompt);

    // ⚠️ Cache hit: kalau form tidak berubah, pakai outline cached
    if (this._cachedOutline && this._cachedOutlineKey === cacheKey) {
      return { fromCache: true, outline: this._cachedOutline, cacheKey };
    }

    const session = Data.getSession();
    if (!session || !session.password || !session.deviceHash) {
      throw new Error('Session tidak valid. Silakan login kembali.');
    }

    // Simpan current request untuk reuse saat generate full
    this._currentRequest = {
      formData,
      prompt,
      cacheKey,
      createdAt: Date.now()
    };

    return {
      action: 'aiGenerateOutline',
      password: session.password,
      deviceHash: session.deviceHash,
      prompt,
      type: formData.type,
      images: formData.images
    };
  },

  /**
   * ⚠️ NEW: Request full generate dengan outline
   */
  async requestFullGenerate(editedOutline) {
    // Validate token
    if (!TokenManager.hasEnough(1)) {
      const error = new Error('Token habis. Hubungi admin untuk top-up.');
      error.code = 'NO_TOKEN';
      throw error;
    }

    const request = this._currentRequest;
    if (!request) {
      throw new Error('Request tidak valid. Silakan isi form ulang.');
    }

    const session = Data.getSession();
    if (!session || !session.password || !session.deviceHash) {
      throw new Error('Session tidak valid. Silakan login kembali.');
    }

    return {
      action: 'aiGenerateFull',
      password: session.password,
      deviceHash: session.deviceHash,
      prompt: request.prompt,
      type: request.formData.type,
      images: request.formData.images,
      outline: {
        judul: String(editedOutline.judul || '').slice(0, 120),
        poin: (editedOutline.poin || []).slice(0, 7)
      }
    };
  },

  /**
   * ⚠️ NEW: Cache outline untuk form tertentu
   */
  cacheOutline(outline, cacheKey) {
    this._cachedOutline = outline;
    this._cachedOutlineKey = cacheKey;
  },

  /**
   * ⚠️ NEW: Clear outline cache (form berubah)
   */
  clearOutlineCache() {
    this._cachedOutline = null;
    this._cachedOutlineKey = null;
  },

  /**
   * Call backend
   */
  async callBackend(requestBody) {
    if (!CONFIG.APPS_SCRIPT_URL) throw new Error('Backend belum dikonfigurasi');

    this._abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      if (this._abortController) this._abortController.abort();
    }, CONFIG.TIMING.AI_TIMEOUT_MS * 2);  // 2x untuk auto-resume

    try {
      const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(requestBody),
        signal: this._abortController.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error('Network error: HTTP ' + response.status);

      const result = await response.json();

      if (!result.success && result.error && this.isBusyError(result.error)) {
        this.setBusyCooldown(30);
      }

      return result;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        const abortErr = new Error('Dibatalkan oleh pengguna');
        abortErr.code = 'ABORTED';
        throw abortErr;
      }
      throw err;
    } finally {
      this._abortController = null;
    }
  },

  isBusyError(msg) {
    const lower = String(msg || '').toLowerCase();
    return lower.includes('sibuk') || lower.includes('503') ||
           lower.includes('502') || lower.includes('504');
  },

  setBusyCooldown(seconds) {
    if (this._busyCooldownTimer) {
      clearInterval(this._busyCooldownTimer);
      this._busyCooldownTimer = null;
    }

    this._busyCooldownUntil = Date.now() + (seconds * 1000);
    const btn = document.getElementById('btnGenerate');
    if (btn) {
      btn.disabled = true;
      let remaining = seconds;
      this._busyCooldownTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(this._busyCooldownTimer);
          this._busyCooldownTimer = null;
          btn.disabled = false;
          btn.title = '';
          this._busyCooldownUntil = 0;
        } else {
          btn.title = 'Server sibuk. Tunggu ' + remaining + 's';
        }
      }, 1000);
    }

    if (window.UI) {
      window.UI.toast(
        '⚠️ Server AI sedang sibuk. Tunggu ' + seconds + ' detik ya.',
        'warning', 5000
      );
    }
  },

  validateResult(result) {
    if (!result) return { valid: false, reason: 'Response kosong dari server' };

    const content = String(result.result || '').trim();
    if (!content) return { valid: false, reason: 'AI menghasilkan dokumen kosong' };
    if (content.length < 500) {
      return { valid: false, reason: 'Dokumen terlalu pendek (' + content.length + ' char). Coba lagi.' };
    }

    const lower = content.toLowerCase();
    if (lower.indexOf('maaf, saya hanya dapat membantu') !== -1) {
      return { valid: false, reason: 'AI menolak topik ini. Coba topik keperawatan lain.' };
    }
    if (lower.startsWith('error') || lower.indexOf('gagal') === 0) {
      return { valid: false, reason: 'AI mengalami kesalahan. Coba lagi.' };
    }
    if (!content.includes('#') && !content.includes('|')) {
      return { valid: false, reason: 'Dokumen tidak memiliki struktur. Coba lagi.' };
    }

    return { valid: true, content };
  },

  /**
   * Save result ke localStorage
   */
  saveResult(result, formData, prompt, options = {}) {
    const type = formData.type;
    const doc = {
      id: generateId(),
      judul: (options.judul || formData.topic || formData.customPrompt.slice(0, 80) || 'Dokumen').trim(),
      type: type,
      tanggal: new Date().toISOString().slice(0, 10),
      content: result,
      originalPrompt: prompt,
      patient: formData.patient,
      partial: options.partial || false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    if (type === 'lp') {
      const list = Data.getLP();
      list.unshift(doc);
      const saveResult = Data.saveLP(list);
      if (!saveResult || !saveResult.success) throw new Error('Gagal menyimpan dokumen');
    } else {
      const list = Data.getAskep();
      list.unshift(doc);
      const saveResult = Data.saveAskep(list);
      if (!saveResult || !saveResult.success) throw new Error('Gagal menyimpan dokumen');
    }

    const saved = this.getDocument(doc.id, type);
    if (!saved || !saved.content || saved.content.length < 100) {
      throw new Error('Dokumen gagal tersimpan. Coba lagi.');
    }

    this._currentDocId = doc.id;

    // Reset status cache & bump request id
    this._statusCache = null;
    this._statusCacheTime = 0;
    this._statusRequestId++;

    setTimeout(() => this.refreshUserStatus(true), 2000);

    return doc;
  },

  getCurrentDocId() { return this._currentDocId; },
  setCurrentDocId(id) { this._currentDocId = id; },
  getCurrentRequest() { return this._currentRequest; },

  clearCurrentRequest() {
    this._currentRequest = null;
  },

  cancel() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  },

  startLoadingScreen() {
    this._loadingStartTime = Date.now();
    let msgIndex = 0;

    const msgEl = document.getElementById('loadingMessage');
    const timerEl = document.getElementById('loadingTimer');
    const fillEl = document.getElementById('loadingBarFill');
    const hintEl = document.querySelector('.loading-hint');

    if (msgEl) {
      msgEl.textContent = this.LOADING_MESSAGES[0];
      this._loadingTextTimer = setInterval(() => {
        msgIndex = (msgIndex + 1) % this.LOADING_MESSAGES.length;
        msgEl.textContent = this.LOADING_MESSAGES[msgIndex];
      }, 2500);
    }

    if (timerEl) {
      this._loadingTimerInterval = setInterval(() => {
        const elapsed = Date.now() - this._loadingStartTime;
        const sec = Math.floor(elapsed / 1000);
        const mm = String(Math.floor(sec / 60)).padStart(2, '0');
        const ss = String(sec % 60).padStart(2, '0');
        timerEl.textContent = mm + ':' + ss;

        if (fillEl) {
          const pct = Math.min(95, (elapsed / 60000) * 100);  // 60s baseline (auto-resume bisa lebih lama)
          fillEl.style.width = pct + '%';
        }

        if (hintEl && elapsed > 45000 && !hintEl.dataset.warned) {
          hintEl.dataset.warned = '1';
          hintEl.textContent = '⏳ Server AI sedang sibuk, dokumen sedang diproses...';
          hintEl.style.color = 'var(--z-warning)';
        }
      }, 100);
    }
  },

  stopLoadingScreen() {
    if (this._loadingTextTimer) {
      clearInterval(this._loadingTextTimer);
      this._loadingTextTimer = null;
    }
    if (this._loadingTimerInterval) {
      clearInterval(this._loadingTimerInterval);
      this._loadingTimerInterval = null;
    }
    const fillEl = document.getElementById('loadingBarFill');
    if (fillEl) fillEl.style.width = '100%';

    const hintEl = document.querySelector('.loading-hint');
    if (hintEl) {
      hintEl.removeAttribute('data-warned');
      hintEl.textContent = 'Jika gagal dalam 60 detik, token akan dikembalikan otomatis';
      hintEl.style.color = '';
    }
  },

  mapError(err) {
    const msg = (err.message || '').toLowerCase();

    if (err.code === 'ABORTED') return { type: 'info', text: 'Dibatalkan' };
    if (err.code === 'NO_TOKEN') return { type: 'warning', text: 'Token habis. Hubungi admin.' };
    if (err.code === 'NO_QUOTA') return { type: 'warning', text: 'Kuota AI hari ini habis. Coba besok.' };
    if (err.code === 'BUSY_COOLDOWN') {
      return { type: 'warning', text: 'Server sibuk. Tunggu ' + (err.waitSec || 30) + ' detik.' };
    }
    if (msg.includes('token habis')) return { type: 'warning', text: 'Token habis. Hubungi admin.' };
    if (msg.includes('sibuk') || msg.includes('503') || msg.includes('502') || msg.includes('504')) {
      return { type: 'warning', text: 'Server AI sedang sibuk. Tunggu 30 detik ya.' };
    }
    if (msg.includes('tunggu') && msg.includes('detik')) {
      return { type: 'warning', text: err.message };
    }
    if (msg.includes('timeout') || msg.includes('aborted')) {
      return { type: 'warning', text: 'AI butuh waktu lebih lama. Coba lagi.' };
    }
    if (msg.includes('limit') || msg.includes('rate') || msg.includes('429')) {
      return { type: 'warning', text: 'Tunggu 1 menit lagi ya, server AI sedang penuh.' };
    }
    if (msg.includes('network') || msg.includes('fetch')) {
      return { type: 'error', text: 'Koneksi gagal. Cek internet Anda.' };
    }
    if (msg.includes('kosong') || msg.includes('empty') || msg.includes('pendek')) {
      return { type: 'error', text: err.message };
    }
    if (msg.includes('gambar') || msg.includes('image')) {
      return { type: 'warning', text: err.message };
    }
    if (msg.includes('outline') || msg.includes('rencana')) {
      return { type: 'warning', text: err.message };
    }
    if (msg.includes('401') || msg.includes('403')) {
      return { type: 'error', text: 'Session tidak valid. Login ulang.' };
    }
    if (msg.includes('session')) {
      return { type: 'error', text: 'Session berakhir. Login ulang.' };
    }

    return { type: 'error', text: err.message || 'Terjadi kesalahan' };
  },

  getDocument(docId, docType) {
    if (docType === 'lp') return Data.getLP().find(d => d.id === docId);
    return Data.getAskep().find(d => d.id === docId);
  },

  updateDocument(docId, docType, updates) {
    const list = docType === 'lp' ? Data.getLP() : Data.getAskep();
    const idx = list.findIndex(d => d.id === docId);
    if (idx === -1) return false;

    list[idx] = { ...list[idx], ...updates, updatedAt: Date.now() };

    if (docType === 'lp') return Data.saveLP(list).success;
    return Data.saveAskep(list).success;
  },

  deleteDocument(docId, docType) {
    if (docType === 'lp') return Data.saveLP(Data.getLP().filter(d => d.id !== docId)).success;
    return Data.saveAskep(Data.getAskep().filter(d => d.id !== docId)).success;
  }
};

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default AI;