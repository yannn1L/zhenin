/* ============================================================
   ZHENIN - Editor Controller (v2.5.0)
   Handle preview/edit/markdown mode, auto-save, contenteditable
   ============================================================ */

import { CONFIG } from './config.js';
import { Data } from './storage.js';
import Parser from './parser.js';
import Renderer from './renderer.js';
import AI from './ai.js';

export const Editor = {
  _currentDocId: null,
  _currentDocType: null,
  _currentContent: '',
  _currentMode: 'preview',
  _saveTimer: null,
  _lastSavedContent: '',

  /**
   * Load document ke editor
   */
  load(docId, docType) {
    const doc = AI.getDocument(docId, docType);
    if (!doc) {
      throw new Error('Dokumen tidak ditemukan');
    }

    this._currentDocId = docId;
    this._currentDocType = docType;
    this._currentContent = doc.content || '';
    this._lastSavedContent = this._currentContent;
    this._currentMode = 'preview';

    return doc;
  },

  /**
   * Get current document
   */
  getCurrentDoc() {
    if (!this._currentDocId) return null;
    return AI.getDocument(this._currentDocId, this._currentDocType);
  },

  /**
   * Render ke container
   */
  render() {
    const paper = document.getElementById('resultPaper');
    const editor = document.getElementById('resultEditor');
    if (!paper || !editor) return;

    const content = this._currentContent;

    // Set editor value
    editor.value = content;

    // Render paper
    try {
      const blocks = Parser.parse(content);
      paper.innerHTML = Renderer.render(blocks);
      this.bindTableActions();
    } catch (err) {
      console.error('Render error:', err);
      paper.innerHTML = `<p style="color:red;padding:20px;">Error render: ${err.message}</p>`;
    }

    // Apply mode
    this.setMode(this._currentMode);
  },

  /**
   * Set view mode
   */
  setMode(mode) {
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
        paper.removeAttribute('contenteditable');
        paper.classList.remove('paper-editing');
      }
      if (editor) editor.classList.add('hidden');

      // Re-render from editor content
      if (paper && editor) {
        try {
          const blocks = Parser.parse(editor.value);
          this._currentContent = editor.value;
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

      // Bind input listener untuk auto-save
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
    if (!paper || paper.dataset.bound === '1') return;
    paper.dataset.bound = '1';

    paper.addEventListener('input', () => {
      this.scheduleSave();
    });

    paper.addEventListener('blur', () => {
      this.saveNow();
    });
  },

  /**
   * Bind action buttons di table
   */
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

  /**
   * Handle edit table
   */
  onTableEdit(tableIdx) {
    // Placeholder - akan implement table editor di iterasi berikut
    if (window.UI) {
      window.UI.toast('Table editor akan tersedia di update berikutnya', 'info');
    }
  },

  /**
   * Handle copy table markdown
   */
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

    // Convert HTML back ke markdown (basic)
    const markdown = this.htmlToMarkdown(paper);
    this._currentContent = markdown;
    this.scheduleSave();
  },

  /**
   * Convert HTML contenteditable back ke markdown (basic)
   * Ini fallback; untuk editing advanced, user bisa switch ke markdown mode
   */
  htmlToMarkdown(container) {
    // Basic approach: parse ulang HTML structure
    // Ini sangat basic, cukup untuk text edits
    let output = [];
    const children = container.children;

    for (let i = 0; i < children.length; i++) {
      const el = children[i];
      const text = el.textContent.trim();
      if (!text) continue;

      const tag = el.tagName.toLowerCase();
      const cls = el.className || '';

      if (tag === 'h1') output.push('# ' + text);
      else if (tag === 'h2') output.push('## ' + text);
      else if (tag === 'h3') output.push('### ' + text);
      else if (tag === 'h4') output.push('#### ' + text);
      else if (tag === 'hr') output.push('---');
      else if (tag === 'ol') {
        const items = el.querySelectorAll('li');
        items.forEach((li, idx) => output.push(`${idx + 1}. ${li.textContent.trim()}`));
      }
      else if (tag === 'ul') {
        const items = el.querySelectorAll('li');
        items.forEach(li => output.push(`- ${li.textContent.trim()}`));
      }
      else if (el.classList.contains('pv-pagebreak')) output.push('\\page');
      else if (el.classList.contains('pv-quote')) output.push('> ' + text);
      else if (tag === 'table') {
        // Extract table markdown
        output.push(this.tableToMarkdown(el));
      }
      else if (tag === 'p') {
        // Detect indent
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
   */
  tableToMarkdown(table) {
    const rows = [];
    table.querySelectorAll('tr').forEach(tr => {
      const cells = [];
      tr.querySelectorAll('th, td').forEach(cell => {
        cells.push(cell.textContent.trim().replace(/\|/g, '\\|'));
      });
      rows.push('| ' + cells.join(' | ') + ' |');
    });

    if (!rows.length) return '';

    // Insert separator after first row
    const headerCells = rows[0].split('|').length - 2;
    const separator = '|' + '---|'.repeat(headerCells);

    return rows[0] + '\n' + separator + '\n' + rows.slice(1).join('\n');
  },

  /**
   * Schedule auto-save
   */
  scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this.saveNow();
    }, 2000); // debounce 2 detik
  },

  /**
   * Save now
   */
  saveNow() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }

    if (!this._currentDocId) return;
    if (this._currentContent === this._lastSavedContent) return;

    // Update content from active mode
    if (this._currentMode === 'markdown') {
      const editor = document.getElementById('resultEditor');
      if (editor) this._currentContent = editor.value;
    } else if (this._currentMode === 'edit') {
      this.updateFromPaper();
    }

    // Save
    AI.updateDocument(this._currentDocId, this._currentDocType, {
      content: this._currentContent
    });

    this._lastSavedContent = this._currentContent;

    // Update UI
    if (window.Profile && window.Profile.renderStats) {
      window.Profile.renderStats();
    }
  },

  /**
   * Export current doc to DOCX
   */
  async exportDocx() {
    if (!this._currentDocId) {
      throw new Error('Tidak ada dokumen aktif');
    }

    const doc = this.getCurrentDoc();
    if (!doc) throw new Error('Dokumen tidak ditemukan');

    // Save dulu
    this.saveNow();

    // Get latest content
    const content = this._currentContent || doc.content || '';

    const result = await Exporter.exportDocx(content, {
      title: doc.judul || 'Dokumen',
      filename: doc.judul || 'Dokumen'
    });

    return result;
  },

  /**
   * Cleanup saat pindah screen
   */
  cleanup() {
    this.saveNow();
    this._currentDocId = null;
    this._currentDocType = null;
    this._currentContent = '';
    this._lastSavedContent = '';
    this._currentMode = 'preview';
  }
};

// Import Exporter di sini biar tidak circular
import Exporter from './exporter.js';

window.Editor = Editor;

export default Editor;