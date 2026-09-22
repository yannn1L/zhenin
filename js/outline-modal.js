/* ============================================================
   ZHENIN - Outline Modal (v2.9.0)
   Preview poin-poin utama sebelum generate full

   Flow:
     1. AI buat outline (judul + 3-7 poin)
     2. Modal tampil preview
     3. User pilih: [Edit Poin] atau [Generate Sekarang]
     4. Edit: inline edit judul + poin (1x), counter 180 char
     5. Confirm: close modal, generate full

   Usage:
     const result = await OutlineModal.show(outline, meta);
     if (result.confirmed) {
       const editedOutline = result.outline;
     }
   ============================================================ */

export const OutlineModal = {
  _outline: null,
  _editMode: false,
  _meta: {},
  _resolveFn: null,

  /**
   * Show modal dengan outline
   * @returns Promise<{ confirmed: bool, outline: {judul, poin[]} | null }>
   */
  show(outline, meta = {}) {
    this._outline = this._normalize(outline);
    this._meta = meta || {};
    this._editMode = false;

    return new Promise((resolve) => {
      this._resolveFn = resolve;

      this._render();
      this._bindEvents();

      const modal = document.getElementById('modalOutline');
      if (modal) {
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
      }
    });
  },

  /**
   * Hide modal
   */
  hide(confirmed = false) {
    const modal = document.getElementById('modalOutline');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';

    if (this._resolveFn) {
      const result = {
        confirmed,
        outline: confirmed ? this._collect() : null
      };
      this._resolveFn(result);
      this._resolveFn = null;
    }

    // Reset state
    this._editMode = false;
  },

  /**
   * Normalize outline dari backend
   */
  _normalize(outline) {
    if (!outline || typeof outline !== 'object') {
      return { judul: '', poin: [] };
    }

    return {
      judul: String(outline.judul || '').trim().slice(0, 120),
      poin: (outline.poin || [])
        .map(p => String(p || '').trim().slice(0, 180))
        .filter(p => p.length > 0)
        .slice(0, 7)
    };
  },

  /**
   * Render modal content
   */
  _render() {
    const body = document.getElementById('outlineModalBody');
    const footer = document.getElementById('outlineModalFooter');
    const title = document.getElementById('outlineModalTitle');
    if (!body || !footer) return;

    if (title) {
      title.textContent = this._editMode ? '✏️ Edit Poin' : '📋 Rencana Dokumen';
    }

    const metaLine = this._buildMetaLine();

    if (this._editMode) {
      body.innerHTML = this._renderEditMode(metaLine);
    } else {
      body.innerHTML = this._renderPreviewMode(metaLine);
    }

    footer.innerHTML = this._renderFooter();
  },

  /**
   * Build meta line (patient name, type)
   */
  _buildMetaLine() {
    const meta = this._meta || {};
    const parts = [];

    if (meta.patient) parts.push('👤 ' + this._esc(meta.patient));
    if (meta.type) parts.push(meta.type === 'lp' ? '📄 LP' : '📋 Askep');

    if (!parts.length) return '';
    return '<div class="outline-meta">' + parts.join(' · ') + '</div>';
  },

  /**
   * Render preview mode
   */
  _renderPreviewMode(metaLine) {
    const o = this._outline;

    let html = metaLine;

    // Judul section
    html += '<div class="outline-section">';
    html += '<div class="outline-label">📌 Judul Dokumen</div>';
    html += '<div class="outline-judul-display">' + this._esc(o.judul || '-') + '</div>';
    html += '</div>';

    html += '<div class="outline-divider"></div>';

    // Poin section
    html += '<div class="outline-section">';
    html += '<div class="outline-label">📋 Poin Utama</div>';

    if (o.poin.length === 0) {
      html += '<div class="outline-empty">Belum ada poin</div>';
    } else {
      html += '<ol class="outline-poin-list">';
      o.poin.forEach(p => {
        html += '<li>' + this._esc(p) + '</li>';
      });
      html += '</ol>';
    }
    html += '</div>';

    // Note
    html += '<div class="outline-note">';
    html += '💡 Poin ini hanya <strong>garis besar</strong>. AI akan mengembangkan ';
    html += 'setiap poin dengan konten keperawatan lengkap.';
    html += '</div>';

    // Cost info
    html += '<div class="outline-cost">';
    html += '💎 <strong>1 token</strong> akan digunakan untuk generate lengkap';
    html += '</div>';

    return html;
  },

  /**
   * Render edit mode
   */
  _renderEditMode(metaLine) {
    const o = this._outline;

    let html = metaLine;

    // Judul
    html += '<div class="outline-section">';
    html += '<div class="outline-label">📌 Judul Dokumen</div>';
    html += '<input type="text" class="form-input outline-input" ';
    html += 'value="' + this._escAttr(o.judul) + '" ';
    html += 'maxlength="120" data-field="judul" autocomplete="off" spellcheck="false">';
    html += '<div class="outline-counter">';
    html += '<span data-counter="judul">' + o.judul.length + '</span>/120';
    html += '</div>';
    html += '</div>';

    html += '<div class="outline-divider"></div>';

    // Poin
    html += '<div class="outline-section">';
    html += '<div class="outline-label">📋 Poin Utama (3-7 poin)</div>';
    html += '<div class="outline-poin-edit-list">';

    o.poin.forEach((p, idx) => {
      html += '<div class="outline-poin-edit-item" data-poin-idx="' + idx + '">';
      html += '<div class="outline-poin-number">' + (idx + 1) + '</div>';
      html += '<div class="outline-poin-input-wrap">';
      html += '<textarea class="form-input outline-textarea" ';
      html += 'maxlength="180" rows="2" spellcheck="false" ';
      html += 'data-field="poin" data-poin-idx="' + idx + '">';
      html += this._esc(p);
      html += '</textarea>';
      html += '<div class="outline-counter">';
      html += '<span data-counter="poin-' + idx + '">' + p.length + '</span>/180';
      html += '</div>';
      html += '</div>';
      html += '</div>';
    });

    html += '</div>';
    html += '</div>';

    // Warning
    html += '<div class="outline-warning">';
    html += '⚠️ Setelah confirm, poin <strong>TIDAK BISA diedit lagi</strong>. ';
    html += 'Pastikan sudah benar sebelum generate.';
    html += '</div>';

    return html;
  },

  /**
   * Render footer buttons
   */
  _renderFooter() {
    if (this._editMode) {
      return (
        '<button type="button" class="btn btn-secondary" data-action="cancel-edit">← Batal</button>' +
        '<button type="button" class="btn btn-primary" data-action="confirm">✅ Generate Sekarang</button>'
      );
    }
    return (
      '<button type="button" class="btn btn-secondary" data-action="edit">✏️ Edit Poin</button>' +
      '<button type="button" class="btn btn-primary" data-action="confirm">✅ Generate Sekarang</button>'
    );
  },

  /**
   * Bind events — hanya sekali per modal
   */
  _bindEvents() {
    const modal = document.getElementById('modalOutline');
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';

    // Live counter update + state update
    modal.addEventListener('input', (e) => {
      const input = e.target;
      const field = input.dataset.field;
      if (!field) return;

      const val = input.value;

      if (field === 'judul') {
        this._outline.judul = val.slice(0, 120);
        const counter = modal.querySelector('[data-counter="judul"]');
        if (counter) counter.textContent = this._outline.judul.length;
      } else if (field === 'poin') {
        const idx = parseInt(input.dataset.poinIdx, 10);
        if (isNaN(idx)) return;

        this._outline.poin[idx] = val.slice(0, 180);
        const counter = modal.querySelector('[data-counter="poin-' + idx + '"]');
        if (counter) counter.textContent = this._outline.poin[idx].length;
      }
    });

    // Click actions
    modal.addEventListener('click', (e) => {
      // Close button / backdrop
      if (e.target.matches('[data-close-outline]')) {
        this.hide(false);
        return;
      }
      if (e.target === modal) {
        this.hide(false);
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;

      if (action === 'edit') {
        this._editMode = true;
        this._render();
      } else if (action === 'cancel-edit') {
        // Batal dari edit mode: reset poin & judul ke awal
        this._editMode = false;
        this._render();
      } else if (action === 'confirm') {
        const validation = this._validate();
        if (!validation.valid) {
          if (window.UI) window.UI.toast(validation.error, 'warning');
          return;
        }
        this.hide(true);
      }
    });

    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) {
        this.hide(false);
      }
    });
  },

  /**
   * Validate outline sebelum confirm
   */
  _validate() {
    const o = this._outline;

    const judul = String(o.judul || '').trim();
    if (judul.length < 5) {
      return { valid: false, error: 'Judul minimal 5 karakter' };
    }
    if (judul.length > 120) {
      return { valid: false, error: 'Judul maksimal 120 karakter' };
    }

    const poin = (o.poin || []).map(p => String(p || '').trim()).filter(Boolean);

    if (poin.length < 3) {
      return { valid: false, error: 'Minimal 3 poin utama' };
    }
    if (poin.length > 7) {
      return { valid: false, error: 'Maksimal 7 poin utama' };
    }

    for (let i = 0; i < poin.length; i++) {
      if (poin[i].length < 10) {
        return { valid: false, error: 'Poin ' + (i + 1) + ' minimal 10 karakter' };
      }
      if (poin[i].length > 180) {
        return { valid: false, error: 'Poin ' + (i + 1) + ' maksimal 180 karakter' };
      }
    }

    return { valid: true };
  },

  /**
   * Collect edited outline untuk dikirim ke backend
   */
  _collect() {
    const o = this._outline;
    return {
      judul: String(o.judul || '').trim().slice(0, 120),
      poin: (o.poin || [])
        .map(p => String(p || '').trim().slice(0, 180))
        .filter(p => p.length >= 10)
        .slice(0, 7)
    };
  },

  /**
   * Escape HTML
   */
  _esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  _escAttr(str) {
    return this._esc(str);
  }
};

export default OutlineModal;