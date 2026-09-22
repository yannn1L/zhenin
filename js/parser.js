/* ============================================================
   ZHENIN - Markdown Parser (v2.8.2 FIXED)
   
   FIX v2.8.2 (CRITICAL):
   - Reset numbered counter HANYA setelah non-list block
   - Baris kosong TIDAK reset counter (list multi-baris tetap lanjut)
   - Setiap heading/paragraph/table/quote reset counter
   - Ini fix bug "1,1,1,1" di DOCX saat list di-break baris kosong
   
   FIX v2.8.1:
   - CB1: Autonumber FORCE replace
   - CB6: Nested list structure
   - CB10/CB11: Case-insensitive tokens
   - CB13: Bold/italic edge case
   - CB16: ColWidths normalize
   - CB27: Numbered list auto-increment
   ============================================================ */

import { CONFIG } from './config.js';

export const Parser = {
  parse(text) {
    const blocks = [];
    const lines = String(text || '').split('\n');
    let i = 0;
    let pendingWidth = null;
    let pendingAutonumber = false;
    let pendingStyle = null;
    let pendingFontSize = null;

    // ⚠️ Numbered list counter per indent level
    const numberedCounters = {};

    // Helper: reset semua counter
    const resetNumberedCounters = () => {
      for (const key in numberedCounters) delete numberedCounters[key];
    };

    while (i < lines.length) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      // ⚠️ FIX v2.8.2: Baris kosong TIDAK reset counter
      // Counter akan di-reset saat ada block non-list
      if (!trimmed) { i++; continue; }

      // ===== HTML Comments (modifiers) — TIDAK reset =====
      if (/^<!--\s*width:\s*[\d\s,.]+\s*-->$/i.test(trimmed)) {
        const m = trimmed.match(/width:\s*([\d\s,.]+)/i);
        if (m) {
          pendingWidth = m[1].split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0);
          if (pendingWidth.length === 0) pendingWidth = null;
        }
        i++; continue;
      }
      if (/^<!--\s*autonumber\s*-->$/i.test(trimmed)) {
        pendingAutonumber = true; i++; continue;
      }
      if (/^<!--\s*table:\s*(small|large|normal)\s*-->$/i.test(trimmed)) {
        const m = trimmed.match(/table:\s*(small|large|normal)/i);
        pendingStyle = m[1].toLowerCase() === 'normal' ? null : m[1].toLowerCase();
        i++; continue;
      }
      if (/^<!--\s*table:\s*font\s*=\s*[\d.]+\s*-->$/i.test(trimmed)) {
        const m = trimmed.match(/font\s*=\s*([\d.]+)/i);
        if (m) pendingFontSize = parseFloat(m[1]);
        i++; continue;
      }

      const lowerTrimmed = trimmed.toLowerCase();

      // ===== Special tokens — RESET counter =====
      if (lowerTrimmed === '\\page' || lowerTrimmed === '[page_break]') {
        blocks.push({ type: 'pagebreak' });
        resetNumberedCounters();
        i++; continue;
      }
      if (/^-{3,}$/.test(trimmed)) {
        blocks.push({ type: 'hr' });
        resetNumberedCounters();
        i++; continue;
      }
      if (lowerTrimmed === '[tabel_ttd]') {
        blocks.push({ type: 'signature' });
        resetNumberedCounters();
        i++; continue;
      }
      const imgMatch = trimmed.match(/^\[gambar:\s*(.+?)\]$/i);
      if (imgMatch) {
        blocks.push({ type: 'image', caption: imgMatch[1].trim() });
        resetNumberedCounters();
        i++; continue;
      }

      // ===== Table — RESET counter =====
      if (trimmed.startsWith('|')) {
        const tStart = i;
        const tLines = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tLines.push(lines[i]);
          i++;
        }
        const tbl = this.parseTable(tLines, {
          width: pendingWidth,
          autonumber: pendingAutonumber,
          style: pendingStyle,
          fontSize: pendingFontSize
        });
        if (tbl) {
          tbl._startLine = tStart;
          tbl._endLine = i - 1;
          blocks.push(tbl);
        }
        pendingWidth = null;
        pendingAutonumber = false;
        pendingStyle = null;
        pendingFontSize = null;
        resetNumberedCounters();
        continue;
      }

      // ===== Headings — RESET counter =====
      if (trimmed.startsWith('#### ')) {
        blocks.push({ type: 'h4', text: trimmed.slice(5).trim() });
        resetNumberedCounters();
        i++; continue;
      }
      if (trimmed.startsWith('### ')) {
        blocks.push({ type: 'h3', text: trimmed.slice(4).trim() });
        resetNumberedCounters();
        i++; continue;
      }
      if (trimmed.startsWith('## ')) {
        blocks.push({ type: 'h2', text: trimmed.slice(3).trim() });
        resetNumberedCounters();
        i++; continue;
      }
      if (trimmed.startsWith('# ')) {
        blocks.push({ type: 'h1', text: trimmed.slice(2).trim() });
        resetNumberedCounters();
        i++; continue;
      }

      // ===== Quote — RESET counter =====
      if (trimmed.startsWith('> ')) {
        blocks.push({ type: 'quote', text: trimmed.slice(2).trim() });
        resetNumberedCounters();
        i++; continue;
      }

      // ===== Numbered list — TIDAK reset, increment counter =====
      if (/^\d+\.\s/.test(trimmed)) {
        const indent = this.getIndentLevel(rawLine);

        // Reset counter untuk level yang lebih dalam
        for (const key in numberedCounters) {
          if (parseInt(key) > indent) delete numberedCounters[key];
        }

        // Increment counter di level ini
        numberedCounters[indent] = (numberedCounters[indent] || 0) + 1;

        blocks.push({
          type: 'numbered',
          indent,
          text: trimmed.replace(/^\d+\.\s*/, ''),
          number: numberedCounters[indent]
        });
        i++; continue;
      }

      // ===== Bullet list — TIDAK reset =====
      if (/^[-*•]\s/.test(trimmed)) {
        const indent = this.getIndentLevel(rawLine);
        blocks.push({
          type: 'bullet',
          indent,
          text: trimmed.replace(/^[-*•]\s*/, '')
        });
        i++; continue;
      }

      // ===== Paragraph — RESET counter =====
      const indent = this.getIndentLevel(rawLine);
      blocks.push({ type: 'paragraph', indent, text: trimmed });
      resetNumberedCounters();
      i++;
    }

    return blocks;
  },

  parseTable(lines, opts = {}) {
    const valid = lines.filter(l => l.trim().startsWith('|'));
    if (valid.length < 1) return null;

    const headers = this.splitRow(valid[0]);
    if (!headers.length) return null;

    let dataStart = 2;
    const secondRow = this.splitRow(valid[1]);
    const isSep = secondRow.length > 0 && secondRow.every(c => /^:?-+:?$/.test(c));
    let aligns = new Array(headers.length).fill('left');

    if (isSep) {
      aligns = secondRow.map(sep => {
        if (/^:-+:$/.test(sep)) return 'center';
        if (/^-+:$/.test(sep)) return 'right';
        return 'left';
      });
      while (aligns.length < headers.length) aligns.push('left');
      aligns = aligns.slice(0, headers.length);
    } else {
      dataStart = 1;
    }

    // Kalau hanya header tanpa rows
    if (valid.length <= dataStart) {
      return {
        type: 'table',
        headers,
        rows: [],
        colWidths: this.computeColumnWidths(headers, []),
        aligns,
        style: opts.style || null,
        fontSize: opts.fontSize || null,
        autonumber: false
      };
    }

    const rows = valid.slice(dataStart).map(line => {
      const cells = this.splitRow(line);
      while (cells.length < headers.length) cells.push('');
      return cells.slice(0, headers.length);
    });

    const normalizeHeader = (h) => String(h || '')
      .toLowerCase()
      .trim()
      .replace(/[.:#*_\-]/g, '')
      .replace(/\s+/g, ' ');

    const firstHeaderNormalized = normalizeHeader(headers[0]);
    const isNoColumn = [
      'no', 'nomor', 'nomer', 'no urut', 'nomor urut',
      'num', 'number', 'index', '#', 'urutan'
    ].includes(firstHeaderNormalized);

    // Detect kalau semua rows kolom 1 punya pola increment
    const allRowsHaveIncrementPattern = rows.length > 0 && rows.every((row) => {
      const val = String(row[0] || '').trim();
      if (!val) return true;
      return /^\d+[.)]?$/.test(val);
    });

    // Detect kalau kolom 1 isinya angka berulang (1,1,1,1)
    const hasRepeatingNumbers = (() => {
      if (rows.length < 2) return false;
      const vals = rows.map(r => String(r[0] || '').trim().replace(/[.)]/g, '')).filter(Boolean);
      if (vals.length < 2) return false;
      const uniqueVals = new Set(vals);
      return uniqueVals.size < vals.length;
    })();

    // FORCE autonumber kalau:
    // 1. Explicit <!-- autonumber -->
    // 2. Header = No/Nomor/dll
    // 3. AI generate pola increment tapi ada duplikat
    const shouldAutonumber = opts.autonumber ||
                              isNoColumn ||
                              (allRowsHaveIncrementPattern && hasRepeatingNumbers);

    if (shouldAutonumber) {
      rows.forEach((row, i) => {
        // FORCE replace
        row[0] = String(i + 1);
      });
    }

    let colWidths;
    if (opts.width && opts.width.length === headers.length) {
      const total = opts.width.reduce((a, b) => a + b, 0);
      colWidths = opts.width.map(w => (w / total) * 100);
    } else {
      colWidths = this.computeColumnWidths(headers, rows);
    }

    // Normalize total ke 100%
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    if (totalWidth > 0 && Math.abs(totalWidth - 100) > 0.01) {
      colWidths = colWidths.map(w => (w / totalWidth) * 100);
    }

    return {
      type: 'table',
      headers,
      rows,
      colWidths,
      aligns,
      style: opts.style || null,
      fontSize: opts.fontSize || null,
      autonumber: shouldAutonumber
    };
  },

  splitRow(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);

    const cells = [];
    let current = '';
    let i = 0;
    while (i < s.length) {
      if (s[i] === '\\' && s[i + 1] === '|') {
        current += '|';
        i += 2;
      } else if (s[i] === '|') {
        cells.push(current.trim());
        current = '';
        i++;
      } else {
        current += s[i];
        i++;
      }
    }
    cells.push(current.trim());
    return cells;
  },

  computeColumnWidths(headers, rows) {
    const colCount = headers.length;
    const MIN_PCT = 8;
    const MAX_PCT = 55;

    const lengths = new Array(colCount).fill(0);
    for (let c = 0; c < colCount; c++) {
      let headerLen = (headers[c] || '').length * 2;
      let maxContentLen = 0;
      let totalContentLen = 0;
      let contentCount = 0;

      for (const row of rows) {
        const cellLen = (row[c] || '').length;
        maxContentLen = Math.max(maxContentLen, cellLen);
        totalContentLen += cellLen;
        contentCount++;
      }

      const avgContentLen = contentCount > 0 ? totalContentLen / contentCount : 0;

      lengths[c] = Math.max(
        headerLen,
        maxContentLen * 0.6 + avgContentLen * 0.4,
        3
      );
    }

    const total = lengths.reduce((a, b) => a + b, 0) || 1;
    const pcts = lengths.map(l => Math.max(MIN_PCT, (l / total) * 100));
    const newTotal = pcts.reduce((a, b) => a + b, 0);
    return pcts.map(p => Math.min(MAX_PCT, (p / newTotal) * 100));
  },

  getIndentLevel(line) {
    let level = 0;
    for (const ch of line) {
      if (ch === '\t') level += 1;
      else if (ch === ' ') level += 0.25;
      else break;
      if (level >= 4) break;
    }
    return Math.floor(level);
  },

  parseInline(text) {
    const runs = [];
    let i = 0;
    let buffer = '';
    let bold = false, italic = false, underline = false;
    let code = false, strike = false, highlight = false;

    function flush() {
      if (buffer) {
        runs.push({ text: buffer, bold, italic, underline, code, strike, highlight });
        buffer = '';
      }
    }

    while (i < text.length) {
      const remaining = text.substr(i).toLowerCase();
      if (remaining.startsWith('<br>')) {
        flush();
        runs.push({ type: 'br' });
        i += 4;
        continue;
      }
      if (remaining.startsWith('<br/>')) {
        flush();
        runs.push({ type: 'br' });
        i += 5;
        continue;
      }
      if (remaining.startsWith('<br />')) {
        flush();
        runs.push({ type: 'br' });
        i += 6;
        continue;
      }

      // *** dulu (bold italic)
      if (text.substr(i, 3) === '***') {
        flush();
        bold = !bold;
        italic = !italic;
        i += 3;
        continue;
      }

      if (text.substr(i, 2) === '**') { flush(); bold = !bold; i += 2; continue; }
      if (text.substr(i, 2) === '__') { flush(); underline = !underline; i += 2; continue; }
      if (text.substr(i, 2) === '~~') { flush(); strike = !strike; i += 2; continue; }
      if (text.substr(i, 2) === '==') { flush(); highlight = !highlight; i += 2; continue; }
      if (text[i] === '*' && text.substr(i, 2) !== '**') { flush(); italic = !italic; i += 1; continue; }
      if (text[i] === '`') { flush(); code = !code; i += 1; continue; }

      buffer += text[i];
      i++;
    }
    flush();

    return runs.length ? runs : [{
      text: text, bold: false, italic: false,
      underline: false, code: false, strike: false, highlight: false
    }];
  },

  serialize(blocks) {
    if (!Array.isArray(blocks)) return '';

    const numCounters = {};

    return blocks.map(block => {
      switch (block.type) {
        case 'h1': return '# ' + block.text;
        case 'h2': return '## ' + block.text;
        case 'h3': return '### ' + block.text;
        case 'h4': return '#### ' + block.text;
        case 'paragraph': {
          const indent = '\t'.repeat(block.indent || 0);
          return indent + block.text;
        }
        case 'numbered': {
          const indent = '\t'.repeat(block.indent || 0);
          const indentLevel = block.indent || 0;
          numCounters[indentLevel] = (numCounters[indentLevel] || 0) + 1;
          for (const key in numCounters) {
            if (parseInt(key) > indentLevel) delete numCounters[key];
          }
          return indent + numCounters[indentLevel] + '. ' + block.text;
        }
        case 'bullet': {
          const indent = '\t'.repeat(block.indent || 0);
          return indent + '- ' + block.text;
        }
        case 'quote': return '> ' + block.text;
        case 'hr': return '---';
        case 'pagebreak': return '\\page';
        case 'signature': return '[TABEL_TTD]';
        case 'image': return `[GAMBAR: ${block.caption}]`;
        case 'table': {
          let md = '';
          if (block.colWidths && block.colWidths.some(w => Math.abs(w - 100 / block.headers.length) > 1)) {
            const widths = block.colWidths.map(w => Math.round(w));
            md += `<!-- width:${widths.join(',')} -->\n`;
          }
          if (block.autonumber) md += `<!-- autonumber -->\n`;
          if (block.style) md += `<!-- table:${block.style} -->\n`;
          if (block.fontSize) md += `<!-- table:font=${block.fontSize} -->\n`;

          md += '| ' + block.headers.map(h => (h || ' ').replace(/\|/g, '\\|')).join(' | ') + ' |\n';
          md += '|' + block.headers.map((_, i) => {
            const a = (block.aligns && block.aligns[i]) || 'left';
            if (a === 'center') return ':---:';
            if (a === 'right') return '---:';
            return '---';
          }).join('|') + '|\n';
          block.rows.forEach(row => {
            md += '| ' + block.headers.map((_, i) => (row[i] || ' ').replace(/\|/g, '\\|')).join(' | ') + ' |\n';
          });
          return md.trimEnd();
        }
        default: return '';
      }
    }).filter(Boolean).join('\n\n');
  }
};

export default Parser;