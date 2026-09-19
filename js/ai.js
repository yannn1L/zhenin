/* ============================================================
   ZHENIN - AI Module (v2.6.0)
   FIX: empty result guard, refusal detection, min length validation
   ============================================================ */

import { CONFIG } from './config.js';
import { Data, StorageMonitor } from './storage.js';
import TokenManager from './token-manager.js';

export const AI = {
  _currentRequest: null,
  _abortController: null,
  _loadingTextTimer: null,
  _loadingTimerInterval: null,
  _loadingStartTime: null,
  _currentDocId: null,

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

    return { type, topic, mode, customPrompt, patient };
  },

  buildPrompt(formData) {
    const { type, topic, mode, customPrompt, patient } = formData;

    if (mode === 'custom') return customPrompt;

    const typeLabel = type === 'lp' ? 'Laporan Pendahuluan (LP)' : 'Asuhan Keperawatan (Askep)';
    let prompt = `Buatkan ${typeLabel} tentang "${topic}"`;

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

  async generate() {
    const formData = this.collectFormData();

    const validation = this.validateForm(formData);
    if (!validation.valid) throw new Error(validation.error);

    if (!TokenManager.hasEnough(1)) {
      const error = new Error('Token habis. Hubungi admin untuk top-up.');
      error.code = 'NO_TOKEN';
      throw error;
    }

    if (!Data.isProfileComplete()) {
      this._showProfileWarning();
    }

    const prompt = this.buildPrompt(formData);

    const session = Data.getSession();
    if (!session || !session.password || !session.deviceHash) {
      throw new Error('Session tidak valid. Silakan login kembali.');
    }

    const requestBody = {
      action: 'aiGenerate',
      password: session.password,
      deviceHash: session.deviceHash,
      prompt,
      type: formData.type
    };

    this._currentRequest = { formData, prompt };

    return requestBody;
  },

  _showProfileWarning() {
    if (typeof window !== 'undefined' && window.UI) {
      window.UI.toast(
        '💡 Tips: Isi profil mahasiswa dulu agar identitas otomatis muncul',
        'info', 4000
      );
    }
  },

  async callBackend(requestBody) {
    if (!CONFIG.APPS_SCRIPT_URL) {
      throw new Error('Backend belum dikonfigurasi');
    }

    this._abortController = new AbortController();

    const timeoutId = setTimeout(() => {
      if (this._abortController) this._abortController.abort();
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
   * ⚠️ FIX: Validate result tidak kosong + bukan refusal
   */
  validateResult(result) {
    if (!result) {
      return { valid: false, reason: 'Response kosong dari server' };
    }

    const content = String(result.result || '').trim();

    if (!content) {
      return { valid: false, reason: 'AI menghasilkan dokumen kosong' };
    }

    if (content.length < 500) {
      return { valid: false, reason: `Dokumen terlalu pendek (${content.length} char). Coba lagi.` };
    }

    // Detect refusal
    const lower = content.toLowerCase();
    if (lower.indexOf('maaf, saya hanya dapat membantu') !== -1) {
      return { valid: false, reason: 'AI menolak topik ini. Coba topik keperawatan lain.' };
    }

    // Detect jika hanya error message
    if (lower.startsWith('error') || lower.indexOf('gagal') === 0) {
      return { valid: false, reason: 'AI mengalami kesalahan. Coba lagi.' };
    }

    // Detect jika tidak ada struktur markdown
    if (!content.includes('#') && !content.includes('|')) {
      return { valid: false, reason: 'Dokumen tidak memiliki struktur. Coba lagi.' };
    }

    return { valid: true, content };
  },

  saveResult(result, formData, prompt) {
    const type = formData.type;
    const doc = {
      id: generateId(),
      judul: (formData.topic || formData.customPrompt.slice(0, 80) || 'Dokumen').trim(),
      type: type,
      tanggal: new Date().toISOString().slice(0, 10),
      content: result,
      originalPrompt: prompt,
      patient: formData.patient,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    if (type === 'lp') {
      const list = Data.getLP();
      list.unshift(doc);
      const saveResult = Data.saveLP(list);
      if (!saveResult || !saveResult.success) {
        throw new Error('Gagal menyimpan dokumen ke storage');
      }
    } else {
      const list = Data.getAskep();
      list.unshift(doc);
      const saveResult = Data.saveAskep(list);
      if (!saveResult || !saveResult.success) {
        throw new Error('Gagal menyimpan dokumen ke storage');
      }
    }

    // ⚠️ VERIFY: Read back untuk pastikan tersimpan
    const saved = this.getDocument(doc.id, type);
    if (!saved || !saved.content || saved.content.length < 100) {
      console.error('[AI] Save verification failed', { docId: doc.id });
      throw new Error('Dokumen gagal tersimpan. Coba lagi.');
    }

    this._currentDocId = doc.id;
    return doc;
  },

  getCurrentDocId() {
    return this._currentDocId;
  },

  setCurrentDocId(id) {
    this._currentDocId = id;
  },

  getCurrentRequest() {
    return this._currentRequest;
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
        timerEl.textContent = `${mm}:${ss}`;

        if (fillEl) {
          const pct = Math.min(95, (elapsed / 30000) * 100);
          fillEl.style.width = pct + '%';
        }

        // Warning kalau > 45 detik
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
    if (msg.includes('token habis')) return { type: 'warning', text: 'Token habis. Hubungi admin.' };
    if (msg.includes('sibuk') || msg.includes('503') || msg.includes('502') || msg.includes('504')) {
      return { type: 'warning', text: 'Server AI sedang sibuk. Coba lagi dalam 30 detik ya.' };
    }
    if (msg.includes('timeout') || msg.includes('aborted')) {
      return { type: 'warning', text: 'AI butuh waktu lebih lama. Coba lagi atau sederhanakan topik.' };
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