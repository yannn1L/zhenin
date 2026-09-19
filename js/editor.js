/* ============================================================
   ZHENIN - Editor Controller (v2.6.0)
   FIX: doc switch race condition, stale content, timer leak
   ============================================================ */

import { CONFIG } from './config.js';
import { Data } from './storage.js';
import Parser from './parser.js';
import Renderer from './renderer.js';
import AI from './ai.js';
import Exporter from './exporter.js';

export const Editor = {
  _currentDocId: null,
  _currentDocType: null,
  _currentContent: '',
  _currentMode: 'preview',
  _saveTimer: null,
  _saveTimerDocId: null,    // ⚠️ Capture docId saat timer dibuat
  _lastSavedContent: '',
  _editableBound: false,

  /**
   * Load document — CLEAR TIMER DULU untuk prevent race condition
   */
  load(docId, docType) {
    // ⚠️ FIX: Save pending dulu jika ada
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }

    // ⚠️ FIX: Save dokumen lama sebelum switch (jika beda doc)
    if (this._currentDocId && this._currentDocId !== docId) {
      this.saveNow();
    }

    const doc = AI.getDocument(docId, docType);
    if (!doc) {
      throw new Error('Dokumen tidak ditemukan');
    }

    // ⚠️ Verify content tidak kosong
    const content = doc.content || '';
    if (!content || content.trim().length === 0) {
      console.warn('[Editor] Dokumen kosong:', docId);
    }

    this._currentDocId = docId;
    this._currentDocType = docType;
    this._currentContent = content;
    this._lastSavedContent = content;
    this._currentMode = 'preview';
    this._editableBound = false;

    return doc;
  },

  getCurrentDoc() {
    if (!this._currentDocId) return null;
    return AI.getDocument(this._currentDocId, this._currentDocType);
  },

  getCurrentDocId() {
    return this._currentDocId;
  },

  getCurrentContent() {
    return this._currentContent;
  },

  render() {
    const paper = document.getElementById('resultPaper');
    const editor = document.getElementById('resultEditor');
    if (!paper || !editor) return;

    const content = this._currentContent;
    editor.value = content;

    try {
      const blocks = Parser.parse(content);
      paper.innerHTML = Renderer.render(blocks);
      this.bindTableActions();
    } catch (err) {
      console.error('Render error:', err);
      paper.innerHTML = `<p style="color:red;padding:20px;">Error render: ${err.message}</p>`;
    }

    this.setMode(this._currentMode);
  },

  setMode(mode) {
    this._currentMode = mode;

    const paper = document.getElementById('resultPaper');
    const editor = document.getElementById('resultEditor');

    document.querySelectorAll('[data-view-mode]').forEach(b => {
      b.classList.toggle('active', b.dataset.viewMode === mode);
    });

    if (mode === 'preview') {
      if (paper) {
        paper.classList.remove('hidden');
        paper.removeAttribute('contenteditable');
        paper.classList.remove('paper-editing');
      }
      if (editor) editor.classList.add('hidden');

      if (paper && editor) {
        try {
          // ⚠️ Save dulu sebelum re-render
          this._currentContent = editor.value;
          const blocks = Parser.parse(this._currentContent);
          paper.innerHTML = Renderer.render(blocks);
          this.bindTableActions();
        } catch (err) {
          console.error('Render error:', err);
        }
      }
    } else if (mode === 'edit') {
      if (paper) {
        paper.classList.remove('hidden');
        paper.setAttribute('contenteditable', 'true');
        paper.classList.add('paper-editing');
      }
      if (editor) editor.classList.add('hidden');
      this.bindEditableListeners();
    } else if (mode === 'markdown') {
      if (paper) {
        paper.classList.add('hidden');
        paper.removeAttribute('contenteditable');
        paper.classList.remove('paper-editing');
      }
      if (editor) {
        editor.classList.remove('hidden');
        editor.focus();
      }
    }
  },

  bindEditableListeners() {
    const paper = document.getElementById('resultPaper');
    if (!paper || this._editableBound) return;
    this._editableBound = true;

    paper.addEventListener('input', () => {
      this.scheduleSave();
    });

    paper.addEventListener('blur', () => {
      this.saveNow();
    });
  },

  bindTableActions() {
    const paper = document.getElementById('resultPaper');
    if (!paper) return;

    paper.querySelectorAll('[data-action="edit-table"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onTableEdit(parseInt(btn.dataset.tableIdx));
      });
    });

    paper.querySelectorAll('[data-action="copy-table"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onTableCopy(parseInt(btn.dataset.tableIdx));
      });
    });
  },

  onTableEdit(tableIdx) {
    if (window.UI) {
      window.UI.toast('Table editor akan tersedia di update berikutnya', 'info');
    }
  },

  async onTableCopy(tableIdx) {
    try {
      const blocks = Parser.parse(this._currentContent);
      const table = blocks[tableIdx];
      if (!table || table.type !== 'table') return;

      const md = Parser.serialize([table]);

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(md);
        if (window.UI) window.UI.toast('📋 Markdown tabel disalin', 'success');
      } else {
        if (window.UI) window.UI.toast('Clipboard tidak didukung', 'warning');
      }
    } catch (err) {
      if (window.UI) window.UI.toast('Gagal copy: ' + err.message, 'error');
    }
  },

  updateFromEditor() {
    const editor = document.getElementById('resultEditor');
    if (!editor) return;
    this._currentContent = editor.value;
    this.scheduleSave();
  },

  updateFromPaper() {
    const paper = document.getElementById('resultPaper');
    if (!paper) return;
    const markdown = this.htmlToMarkdown(paper);
    this._currentContent = markdown;
  },

  htmlToMarkdown(container) {
    if (!container) return '';
    const output = [];
    const children = container.children;

    for (let i = 0; i < children.length; i++) {
      const el = children[i];
      if (!el) continue;

      const tag = el.tagName.toLowerCase();
      const cls = el.className || '';

      // Skip action buttons
      if (el.classList && el.classList.contains('pv-table-actions')) continue;

      if (el.classList && el.classList.contains('pv-pagebreak')) {
        output.push('\\page');
        continue;
      }

      if (el.classList && el.classList.contains('pv-hr')) {
        output.push('---');
        continue;
      }

      if (el.classList && el.classList.contains('pv-quote')) {
        output.push('> ' + el.textContent.trim());
        continue;
      }

      if (tag === 'table') {
        if (el.classList.contains('pv-ttd')) {
          output.push('[TABEL_TTD]');
          continue;
        }
        if (el.classList.contains('pv-image')) {
          const caption = el.querySelector('.pv-img-caption');
          const cap = caption ? caption.textContent.replace(/^Gambar:\s*/, '').trim() : '';
          output.push(`[GAMBAR: ${cap}]`);
          continue;
        }
        output.push(this.tableToMarkdown(el));
        continue;
      }

      if (tag === 'h1') { output.push('# ' + el.textContent.trim()); continue; }
      if (tag === 'h2') { output.push('## ' + el.textContent.trim()); continue; }
      if (tag === 'h3') { output.push('### ' + el.textContent.trim()); continue; }
      if (tag === 'h4') { output.push('#### ' + el.textContent.trim()); continue; }

      if (tag === 'ol') {
        const items = el.querySelectorAll('li');
        items.forEach((li, idx) => output.push(`${idx + 1}. ${li.textContent.trim()}`));
        continue;
      }

      if (tag === 'ul') {
        const items = el.querySelectorAll('li');
        items.forEach(li => output.push(`- ${li.textContent.trim()}`));
        continue;
      }

      if (tag === 'p' || tag === 'div') {
        const text = el.textContent.trim();
        if (!text) continue;

        const indentMatch = cls.match(/indent-(\d)/);
        const indent = indentMatch ? parseInt(indentMatch[1]) : 0;
        const tabs = '\t'.repeat(indent);
        output.push(tabs + text);
      }
    }

    return output.join('\n\n');
  },

  tableToMarkdown(table) {
    const rows = [];
    table.querySelectorAll('tr').forEach(tr => {
      const cells = [];
      tr.querySelectorAll('th, td').forEach(cell => {
        let text = cell.textContent.trim().replace(/\|/g, '\\|');
        cells.push(text);
      });
      rows.push('| ' + cells.join(' | ') + ' |');
    });

    if (!rows.length) return '';

    const headerCells = rows[0].split('|').length - 2;
    const separator = '|' + '---|'.repeat(headerCells);

    return rows[0] + '\n' + separator + '\n' + rows.slice(1).join('\n');
  },

  /**
   * ⚠️ CRITICAL: Schedule save dengan capture docId
   */
  scheduleSave() {
    // Capture current docId
    const targetDocId = this._currentDocId;
    const targetDocType = this._currentDocType;

    if (this._saveTimer) clearTimeout(this._saveTimer);

    this._saveTimerDocId = targetDocId;
    this._saveTimer = setTimeout(() => {
      // ⚠️ Verify docId masih sama saat timer fire
      if (this._currentDocId !== targetDocId) {
        console.warn('[Editor] Timer skipped: doc changed');
        return;
      }
      this.saveNow(targetDocId, targetDocType);
    }, 2000);
  },

  /**
   * Save now — dengan explicit docId untuk prevent race
   */
  saveNow(explicitDocId, explicitDocType) {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      this._saveTimerDocId = null;
    }

    const targetDocId = explicitDocId || this._currentDocId;
    const targetDocType = explicitDocType || this._currentDocType;

    if (!targetDocId) return;
    if (this._currentDocId !== targetDocId) {
      console.warn('[Editor] Save skipped: doc mismatch');
      return;
    }

    // Get latest content dari active mode
    if (this._currentMode === 'markdown') {
      const editor = document.getElementById('resultEditor');
      if (editor) this._currentContent = editor.value;
    } else if (this._currentMode === 'edit') {
      this.updateFromPaper();
    }

    // Skip jika sama
    if (this._currentContent === this._lastSavedContent) return;

    // Verify content valid (tidak kosong)
    if (!this._currentContent || this._currentContent.trim().length === 0) {
      console.warn('[Editor] Skip save: konten kosong');
      return;
    }

    // Save ke storage
    const saved = AI.updateDocument(targetDocId, targetDocType, {
      content: this._currentContent
    });

    if (saved) {
      this._lastSavedContent = this._currentContent;
      console.log('[Editor] Saved:', targetDocId, '(' + this._currentContent.length + ' chars)');

      if (window.Profile && window.Profile.renderStats) {
        window.Profile.renderStats();
      }
    }
  },

  /**
   * Export DOCX — baca langsung dari document object
   */
  async exportDocx() {
    if (!this._currentDocId) {
      throw new Error('Tidak ada dokumen aktif');
    }

    // ⚠️ Save dulu
    this.saveNow();

    // ⚠️ Verify docId masih sama
    if (!this._currentDocId) {
      throw new Error('Dokumen berubah saat export');
    }

    const targetDocId = this._currentDocId;
    const targetDocType = this._currentDocType;

    // Read langsung dari storage (source of truth)
    const doc = AI.getDocument(targetDocId, targetDocType);
    if (!doc) throw new Error('Dokumen tidak ditemukan');

    // ⚠️ Verify content tidak kosong
    const content = (doc.content || '').trim();
    if (!content || content.length < 50) {
      throw new Error('Konten dokumen kosong atau terlalu pendek');
    }

    // Get fresh content
    const exportContent = this._currentContent || content;

    const result = await Exporter.exportDocx(exportContent, {
      title: doc.judul || 'Dokumen',
      filename: doc.judul || 'Dokumen',
      docId: targetDocId
    });

    return result;
  },

  cleanup() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this.saveNow();
    this._currentDocId = null;
    this._currentDocType = null;
    this._currentContent = '';
    this._lastSavedContent = '';
    this._currentMode = 'preview';
    this._editableBound = false;
  }
};

window.Editor = Editor;

export default Editor;