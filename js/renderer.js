/* ============================================================
   ZHENIN - HTML Renderer (v2.7.2 FIXED)
   FIX:
   - Konsistensi font size tabel dengan DOCX (10pt)
   - <br> di table cell & list di-render proper
   - Guard block null
   - renderInline handle br di paragraph
   ============================================================ */

import { CONFIG } from './config.js';
import { Data } from './storage.js';
import Parser from './parser.js';

export const Renderer = {
  render(blocks) {
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return '<p style="color:#94a3b8;text-align:center;padding:40px;font-family:-apple-system,sans-serif;">Dokumen kosong</p>';
    }
    return blocks.map((block, idx) => this.renderBlock(block, idx)).join('\n');
  },

  renderBlock(block, idx) {
    if (!block || !block.type) return '';

    switch (block.type) {
      case 'h1': return `<h1 class="pv-h1">${this.renderInline(block.text)}</h1>`;
      case 'h2': return `<h2 class="pv-h2">${this.renderInline(block.text)}</h2>`;
      case 'h3': return `<h3 class="pv-h3">${this.renderInline(block.text)}</h3>`;
      case 'h4': return `<h4 class="pv-h4">${this.renderInline(block.text)}</h4>`;
      case 'paragraph': {
        const cls = block.indent > 0 ? `indent-${Math.min(block.indent, 3)}` : '';
        const content = this.renderInline(block.text) || '&nbsp;';
        return `<p class="pv-p ${cls}">${content}</p>`;
      }
      case 'numbered': {
        const indent = block.indent || 0;
        return `<ol class="pv-list indent-${Math.min(indent, 3)}" start="${block.number || 1}"><li>${this.renderInline(block.text)}</li></ol>`;
      }
      case 'bullet': {
        const indent = block.indent || 0;
        return `<ul class="pv-list indent-${Math.min(indent, 3)}"><li>${this.renderInline(block.text)}</li></ul>`;
      }
      case 'quote': return `<div class="pv-quote">${this.renderInline(block.text)}</div>`;
      case 'hr': return `<hr class="pv-hr">`;
      case 'pagebreak': return `<div class="pv-pagebreak"></div>`;
      case 'signature': return this.renderSignature();
      case 'image': {
        const cap = this.replacePlaceholders(block.caption);
        return `<table class="pv-image"><tr><td>[ Sisipkan gambar di sini ]<span class="pv-img-caption">Gambar: ${this.escapeHtml(cap)}</span></td></tr></table>`;
      }
      case 'table': return this.renderTable(block, idx);
      default: return '';
    }
  },

  /**
   * Render inline markdown
   * FIX: Handle <br> di paragraph → <br> tag
   * FIX: Handle br marker dari parseInline
   */
  renderInline(text) {
    if (!text) return '';
    const withPlaceholders = this.replacePlaceholders(text);
    const runs = Parser.parseInline(withPlaceholders);

    let html = runs.map(run => {
      // Handle br marker dari parseInline
      if (run.type === 'br') return '<br>';

      let part = this.escapeHtml(run.text);
      if (run.bold) part = `<strong>${part}</strong>`;
      if (run.italic) part = `<em>${part}</em>`;
      if (run.underline) part = `<u>${part}</u>`;
      if (run.strike) part = `<s>${part}</s>`;
      if (run.code) part = `<code>${part}</code>`;
      if (run.highlight) part = `<mark>${part}</mark>`;
      return part;
    }).join('');

    // Legacy: restore &lt;br&gt; yang ter-escape jadi line break
    html = html.replace(/&lt;br\s*\/?&gt;/gi, '<br>');

    return html;
  },

  renderTable(block, tableIdx) {
    if (!block || !block.headers) return '';

    const { headers, rows, colWidths, aligns, style, fontSize } = block;

    const colgroup = (colWidths || []).map(w => `<col style="width:${w.toFixed(2)}%">`).join('');

    const thead = `<tr>${headers.map((h, i) => {
      const a = (aligns && aligns[i]) || 'left';
      return `<th class="align-${a}">${this.renderInline(h)}</th>`;
    }).join('')}</tr>`;

    const tbody = (rows || []).map(row => {
      return `<tr>${row.map((c, i) => {
        const a = (aligns && aligns[i]) || 'left';
        return `<td class="align-${a}">${this.renderInline(c) || '&nbsp;'}</td>`;
      }).join('')}</tr>`;
    }).join('');

    let styleCls = '';
    let inlineStyle = '';
    if (style) styleCls = ` ${style}`;
    if (fontSize) inlineStyle = ` style="font-size:${fontSize}pt"`;

    return `<table class="pv-table${styleCls}"${inlineStyle}>
      <colgroup>${colgroup}</colgroup>
      <thead>${thead}</thead>
      <tbody>${tbody}</tbody>
    </table>`;
  },

  renderSignature() {
    return `<table class="pv-ttd">
      <tr>
        <th>Yang Membuat/Mahasiswa</th>
        <th>Yang Memverifikasi/Clinical Instructor (CI)</th>
      </tr>
      <tr>
        <td>Nama Lengkap &amp; Tanda Tangan</td>
        <td>Nama Lengkap &amp; Tanda Tangan</td>
      </tr>
    </table>`;
  },

  replacePlaceholders(text) {
    if (!text) return '';
    const profile = Data.getProfile();

    return text
      .replace(/\[NAMA_MHS\]/g, profile.nama || '[NAMA_MHS]')
      .replace(/\[NIM\]/g, profile.nim || '-')
      .replace(/\[KELOMPOK\]/g, profile.kelompok || '-')
      .replace(/\[TEMPAT\]/g, profile.tempatPraktik || '-')
      .replace(/\[PERIODE\]/g, profile.periodePraktik || '-')
      .replace(/\[NAMA_CI\]/g, profile.ci || '[NAMA_CI]')
      .replace(/\[TANGGAL\]/g, this.formatTanggalIndo())
      .replace(/\[IDENTITAS_MHS\]/g, '__IDENTITAS_MHS_MARKER__');
  },

  formatTanggalIndo() {
    const bulan = ['Januari','Februari','Maret','April','Mei','Juni',
                   'Juli','Agustus','September','Oktober','November','Desember'];
    const d = new Date();
    return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
  },

  escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
};

export default Renderer;