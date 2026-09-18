/* ============================================================
   ZHENIN - AI Generation Module (v2.3.0)
   Handle AI generation flow: build prompt, submit, loading, result
   ============================================================ */

import { CONFIG } from './config.js';
import { Data, StorageMonitor } from './storage.js';
import TokenManager from './token-manager.js';

/* ============================================================
   AI MODULE
   ============================================================ */
export const AI = {
  _currentRequest: null,
  _abortController: null,
  _loadingTextTimer: null,
  _loadingTimerInterval: null,
  _loadingStartTime: null,
  _currentDocId: null,

  /**
   * Loading messages rotation
   */
  LOADING_MESSAGES: [
    'Menganalisis topik...',
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
    'Finalisasi dokumen...'
  ],

  /**
   * Validate form input
   */
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
        return { valid: false, error: `Prompt terlalu panjang (max ${CONFIG.LIMITS.PROMPT_MAX} char)` };
      }
    } else {
      if (!topic || topic.trim().length < 3) {
        return { valid: false, error: 'Topik minimal 3 karakter' };
      }
      if (topic.length > CONFIG.LIMITS.TOPIC_MAX) {
        return { valid: false, error: `Topik terlalu panjang (max ${CONFIG.LIMITS.TOPIC_MAX} char)` };
      }
    }

    return { valid: true };
  },

  /**
   * Collect form data
   */
  collectFormData() {
    const type = document.getElementById('aiType')?.value || 'askep';
    const topic = document.getElementById('aiTopic')?.value.trim() || '';
    const mode = document.getElementById('aiMode')?.value || 'template';
    const customPrompt = document.getElementById('aiCustomPrompt')?.value.trim() || '';

    // Patient data
    const patient = {
      nama: document.getElementById('pName')?.value.trim() || '',
      umur: document.getElementById('pAge')?.value.trim() || '',
      gender: document.getElementById('pGender')?.value || '',
      room: document.getElementById('pRoom')?.value.trim() || '',
      dx: document.getElementById('pDx')?.value.trim() || '',
      complaint: document.getElementById('pComplaint')?.value.trim() || '',
      detail: document.getElementById('pDetail')?.value.trim() || ''
    };

    return { type, topic, mode, customPrompt, patient };
  },

  /**
   * Build prompt dari form data
   */
  buildPrompt(formData) {
    const { type, topic, mode, customPrompt, patient } = formData;

    if (mode === 'custom') {
      return customPrompt;
    }

    // Template mode
    const typeLabel = type === 'lp' ? 'Laporan Pendahuluan (LP)' : 'Asuhan Keperawatan (Askep)';
    let prompt = `Buatkan ${typeLabel} tentang "${topic}"`;

    // Tambah data pasien kalau ada
    const hasPatientData = Object.values(patient).some(v => v && v.trim());

    if (hasPatientData) {
      prompt += `\n\nData Pasien:`;
      if (patient.nama) prompt += `\n- Nama: ${patient.nama}`;
      if (patient.umur) prompt += `\n- Umur: ${patient.umur} tahun`;
      if (patient.gender) prompt += `\n- Jenis Kelamin: ${patient.gender}`;
      if (patient.room) prompt += `\n- Ruang Rawat: ${patient.room}`;
      if (patient.dx) prompt += `\n- Dx. Medis: ${patient.dx}`;
      if (patient.complaint) prompt += `\n- Keluhan Utama: ${patient.complaint}`;
      if (patient.detail) prompt += `\n- Detail Tambahan: ${patient.detail}`;
    } else {
      prompt += `\n\nGunakan data pasien yang realistis dan umum untuk kasus ini.`;
    }

    if (type === 'askep') {
      prompt += `\n\nSertakan implementasi dan evaluasi 3 hari (SOAP).`;
    }

    return prompt;
  },

  /**
   * Main generate function
   */
  async generate() {
    const formData = this.collectFormData();

    // 1. Validate form
    const validation = this.validateForm(formData);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // 2. Check token
    if (!TokenManager.hasEnough(1)) {
      const error = new Error('Token habis. Hubungi admin untuk top-up.');
      error.code = 'NO_TOKEN';
      throw error;
    }

    // 3. Check profile (warning only, tidak block)
    if (!Data.isProfileComplete()) {
      this._showProfileWarning();
    }

    // 4. Build prompt
    const prompt = this.buildPrompt(formData);

    // 5. Get session
    const session = Data.getSession();
    if (!session || !session.password || !session.deviceHash) {
      throw new Error('Session tidak valid. Silakan login kembali.');
    }

    // 6. Prepare request
    const requestBody = {
      action: 'aiGenerate',
      password: session.password,
      deviceHash: session.deviceHash,
      prompt,
      type: formData.type
    };

    // 7. Store current request untuk regenerate
    this._currentRequest = { formData, prompt };

    return requestBody;
  },

  /**
   * Show profile warning (toast + navigate to profile)
   */
  _showProfileWarning() {
    // Defer to UI
    if (typeof window !== 'undefined' && window.UI) {
      window.UI.toast(
        '💡 Tips: Isi profil mahasiswa dulu agar identitas otomatis muncul',
        'info',
        4000
      );
    }
  },

  /**
   * Call backend AI generation
   */
  async callBackend(requestBody) {
    if (!CONFIG.APPS_SCRIPT_URL) {
      throw new Error('Backend belum dikonfigurasi');
    }

    // Create AbortController untuk cancel
    this._abortController = new AbortController();

    const timeoutId = setTimeout(() => {
      if (this._abortController) {
        this._abortController.abort();
      }
    }, CONFIG.TIMING.AI_TIMEOUT_MS);

    try {
      const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(requestBody),
        signal: this._abortController.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Network error: HTTP ${response.status}`);
      }

      const result = await response.json();
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

  /**
   * Save result to localStorage
   */
  saveResult(result, formData, prompt) {
    const type = formData.type;
    const doc = {
      id: generateId(),
      judul: formData.topic || formData.customPrompt.slice(0, 80) || 'Dokumen',
      type: type,
      tanggal: new Date().toISOString().slice(0, 10),
      content: result,
      originalPrompt: prompt,
      patient: formData.patient,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Save ke list
    if (type === 'lp') {
      const list = Data.getLP();
      list.unshift(doc);
      Data.saveLP(list);
    } else {
      const list = Data.getAskep();
      list.unshift(doc);
      Data.saveAskep(list);
    }

    this._currentDocId = doc.id;
    return doc;
  },

  /**
   * Get current doc ID
   */
  getCurrentDocId() {
    return this._currentDocId;
  },

  /**
   * Set current doc ID (untuk load dari home)
   */
  setCurrentDocId(id) {
    this._currentDocId = id;
  },

  /**
   * Get current request (untuk regenerate)
   */
  getCurrentRequest() {
    return this._currentRequest;
  },

  /**
   * Cancel current request
   */
  cancel() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  },

  /**
   * Start loading screen with rotation text + timer
   */
  startLoadingScreen() {
    this._loadingStartTime = Date.now();
    let msgIndex = 0;

    const msgEl = document.getElementById('loadingMessage');
    const timerEl = document.getElementById('loadingTimer');
    const fillEl = document.getElementById('loadingBarFill');

    // Rotate messages tiap 2.5 detik
    if (msgEl) {
      msgEl.textContent = this.LOADING_MESSAGES[0];
      this._loadingTextTimer = setInterval(() => {
        msgIndex = (msgIndex + 1) % this.LOADING_MESSAGES.length;
        msgEl.textContent = this.LOADING_MESSAGES[msgIndex];
      }, 2500);
    }

    // Update timer tiap 100ms + fake progress bar
    if (timerEl) {
      this._loadingTimerInterval = setInterval(() => {
        const elapsed = Date.now() - this._loadingStartTime;
        const sec = Math.floor(elapsed / 1000);
        const mm = String(Math.floor(sec / 60)).padStart(2, '0');
        const ss = String(sec % 60).padStart(2, '0');
        timerEl.textContent = `${mm}:${ss}`;

        // Fake progress (max 95%)
        if (fillEl) {
          const pct = Math.min(95, (elapsed / 30000) * 100);
          fillEl.style.width = pct + '%';
        }
      }, 100);
    }
  },

  /**
   * Stop loading screen
   */
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
  },

  /**
   * Map error ke user-friendly message
   */
  mapError(err) {
    const msg = (err.message || '').toLowerCase();

    if (err.code === 'ABORTED') {
      return { type: 'info', text: 'Dibatalkan' };
    }
    if (err.code === 'NO_TOKEN') {
      return { type: 'warning', text: 'Token habis. Hubungi admin.' };
    }
    if (msg.includes('token habis')) {
      return { type: 'warning', text: 'Token habis. Hubungi admin.' };
    }
    if (msg.includes('limit') || msg.includes('rate')) {
      return { type: 'warning', text: err.message };
    }
    if (msg.includes('timeout') || msg.includes('aborted')) {
      return { type: 'error', text: 'AI timeout. Token dikembalikan. Coba lagi.' };
    }
    if (msg.includes('network') || msg.includes('fetch')) {
      return { type: 'error', text: 'Koneksi gagal. Cek internet Anda.' };
    }
    if (msg.includes('401') || msg.includes('403')) {
      return { type: 'error', text: 'Session tidak valid. Login ulang.' };
    }
    if (msg.includes('503') || msg.includes('504') || msg.includes('502')) {
      return { type: 'error', text: 'Server sibuk. Coba lagi sebentar.' };
    }
    if (msg.includes('session')) {
      return { type: 'error', text: 'Session berakhir. Login ulang.' };
    }

    return { type: 'error', text: err.message || 'Terjadi kesalahan' };
  },

  /**
   * Get document by ID
   */
  getDocument(docId, docType) {
    if (docType === 'lp') {
      return Data.getLP().find(d => d.id === docId);
    } else {
      return Data.getAskep().find(d => d.id === docId);
    }
  },

  /**
   * Update document content
   */
  updateDocument(docId, docType, updates) {
    const list = docType === 'lp' ? Data.getLP() : Data.getAskep();
    const idx = list.findIndex(d => d.id === docId);
    if (idx === -1) return false;

    list[idx] = { ...list[idx], ...updates, updatedAt: Date.now() };
    if (docType === 'lp') Data.saveLP(list);
    else Data.saveAskep(list);
    return true;
  },

  /**
   * Delete document
   */
  deleteDocument(docId, docType) {
    if (docType === 'lp') {
      Data.saveLP(Data.getLP().filter(d => d.id !== docId));
    } else {
      Data.saveAskep(Data.getAskep().filter(d => d.id !== docId));
    }
    return true;
  }
};

/* ============================================================
   HELPERS
   ============================================================ */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default AI;