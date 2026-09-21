/* ============================================================
   ZHENIN - Editor Controller (v2.6.3)
   FIX:
   - Hapus mode 'edit' terpisah, gabung dengan 'preview' (WYSIWYG)
   - Hapus table actions (edit/copy MD)
   - Prevent paste berformat aneh
   - Bug check: timer race condition, stale content
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
  _saveTimerDocId: null,
  _lastSavedContent: '',
  _editableBound: false,

  /**
   * Load document — clear timer dulu
   */
  load(docId, docType) {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      this._saveTimerDocId = null;
    }

    if (this._currentDocId && this._currentDocId !== docId) {
      this.saveNow();
    }

    const doc = AI.getDocument(docId, docType);
    if (!doc) {
      throw new Error('Dokumen tidak ditemukan');
    }

    const content = doc.content || '';

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

  /**
   * Render ke container
   */
  render() {
    const paper = document.getElementById('resultPaper');
    const editor = document.getElementById('resultEditor');
    if (!paper || !editor) return;

    const content = this._currentContent;
    editor.value = content;

    try {
      const blocks = Parser.parse(content);
      paper.innerHTML = Renderer.render(blocks);
    } catch (err) {
      console.error('Render error:', err);
      paper.innerHTML = `<p style="color:red;padding:20px;">Error render: ${err.message}</p>`;
    }

    this.setMode(this._currentMode);
  },

  /**
   * Set view mode (hanya 2 mode: preview/unified & markdown)
   * ⚠️ FIX: Mode 'edit' auto-convert ke 'preview'
   */
  setMode(mode) {
    if (mode === 'edit') mode = 'preview';
    this._currentMode = mode;

    const paper = document.getElementById('resultPaper');
    const editor = document.getElementById('resultEditor');

    // Update button states
    document.querySelectorAll('[data-view-mode]').forEach(b => {
      b.classList.toggle('active', b.dataset.viewMode === mode);
    });

    if (mode === 'preview') {
      if (paper) {
        paper.classList.remove('hidden');
        paper.setAttribute('contenteditable', 'true');
        paper.classList.add('paper-editing');
      }
      if (editor) editor.classList.add('hidden');

      // Re-render dari editor content
      if (paper && editor) {
        try {
          this._currentContent = editor.value;
          const blocks = Parser.parse(this._currentContent);
          paper.innerHTML = Renderer.render(blocks);
        } catch (err) {
          console.error('Render error:', err);
        }
      }

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

  /**
   * Bind listener untuk contenteditable
   */
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

    // Prevent paste dengan format aneh (dari Word/web)
    paper.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (text) {
        document.execCommand('insertText', false, text);
      }
    });
  },

  /**
   * Update content dari editor textarea
   */
  updateFromEditor() {
    const editor = document.getElementById('resultEditor');
    if (!editor) return;
    this._currentContent = editor.value;
    this.scheduleSave();
  },

  /**
   * Update content dari contenteditable
   */
  updateFromPaper() {
    const paper = document.getElementById('resultPaper');
    if (!paper) return;
    const markdown = this.htmlToMarkdown(paper);
    this._currentContent = markdown;
  },

  /**
   * Convert HTML contenteditable back ke markdown
   */
  htmlToMarkdown(container) {
    if (!container) return '';
    const output = [];
    const children = container.children;

    for (let i = 0; i < children.length; i++) {
      const el = children[i];
      if (!el) continue;

      const tag = el.tagName.toLowerCase();
      const cls = el.className || '';

      // Skip action buttons (legacy)
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

  /**
   * Extract table HTML → markdown
   * ⚠️ FIX: Handle <br> dalam cell sebagai newline markdown (pakai <br> literal)
   */
  tableToMarkdown(table) {
    const rows = [];
    table.querySelectorAll('tr').forEach(tr => {
      const cells = [];
      tr.querySelectorAll('th, td').forEach(cell => {
        // ⚠️ FIX: Konversi <br> jadi literal <br> dalam cell
        let html = cell.innerHTML;
        html = html.replace(/<br\s*\/?>/gi, '|||BR|||');
        let text = html.replace(/<[^>]+>/g, ''); // strip tags
        text = text.replace(/\|\|\|BR\|\|\|/g, '<br>');
        text = text.trim().replace(/\|/g, '\\|');
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
   * Schedule save (debounce 2s) dengan capture docId
   */
  scheduleSave() {
    const targetDocId = this._currentDocId;
    const targetDocType = this._currentDocType;

    if (this._saveTimer) clearTimeout(this._saveTimer);

    this._saveTimerDocId = targetDocId;
    this._saveTimer = setTimeout(() => {
      if (this._currentDocId !== targetDocId) {
        console.warn('[Editor] Timer skipped: doc changed');
        return;
      }
      this.saveNow(targetDocId, targetDocType);
    }, 2000);
  },

  /**
   * Save now
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

    if (this._currentMode === 'markdown') {
      const editor = document.getElementById('resultEditor');
      if (editor) this._currentContent = editor.value;
    } else if (this._currentMode === 'preview') {
      this.updateFromPaper();
    }

    if (this._currentContent === this._lastSavedContent) return;

    if (!this._currentContent || this._currentContent.trim().length === 0) {
      console.warn('[Editor] Skip save: konten kosong');
      return;
    }

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
   * Export DOCX
   */
  async exportDocx() {
    if (!this._currentDocId) {
      throw new Error('Tidak ada dokumen aktif');
    }

    this.saveNow();

    if (!this._currentDocId) {
      throw new Error('Dokumen berubah saat export');
    }

    const targetDocId = this._currentDocId;
    const targetDocType = this._currentDocType;

    const doc = AI.getDocument(targetDocId, targetDocType);
    if (!doc) throw new Error('Dokumen tidak ditemukan');

    const content = (doc.content || '').trim();
    if (!content || content.length < 50) {
      throw new Error('Konten dokumen kosong atau terlalu pendek');
    }

    const exportContent = this._currentContent || content;

    const result = await Exporter.exportDocx(exportContent, {
      title: doc.judul || 'Dokumen',
      filename: doc.judul || 'Dokumen',
      docId: targetDocId
    });

    return result;
  },

  /**
   * Cleanup saat pindah screen
   */
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