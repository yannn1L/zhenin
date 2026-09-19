/* ============================================================
   ZHENIN - Markdown Parser (v2.6.0)
   FIX: serialize table, table detection, edge cases
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

    while (i < lines.length) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();
      if (!trimmed) { i++; continue; }

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

      if (trimmed === '\\page' || trimmed === '[PAGE_BREAK]') {
        blocks.push({ type: 'pagebreak' }); i++; continue;
      }
      if (/^-{3,}$/.test(trimmed)) {
        blocks.push({ type: 'hr' }); i++; continue;
      }
      if (trimmed === '[TABEL_TTD]') {
        blocks.push({ type: 'signature' }); i++; continue;
      }
      const imgMatch = trimmed.match(/^\[GAMBAR:\s*(.+?)\]$/i);
      if (imgMatch) {
        blocks.push({ type: 'image', caption: imgMatch[1].trim() });
        i++; continue;
      }

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
        continue;
      }

      if (trimmed.startsWith('#### ')) {
        blocks.push({ type: 'h4', text: trimmed.slice(5).trim() }); i++; continue;
      }
      if (trimmed.startsWith('### ')) {
        blocks.push({ type: 'h3', text: trimmed.slice(4).trim() }); i++; continue;
      }
      if (trimmed.startsWith('## ')) {
        blocks.push({ type: 'h2', text: trimmed.slice(3).trim() }); i++; continue;
      }
      if (trimmed.startsWith('# ')) {
        blocks.push({ type: 'h1', text: trimmed.slice(2).trim() }); i++; continue;
      }

      if (trimmed.startsWith('> ')) {
        blocks.push({ type: 'quote', text: trimmed.slice(2).trim() }); i++; continue;
      }

      if (/^\d+\.\s/.test(trimmed)) {
        const indent = this.getIndentLevel(rawLine);
        const numMatch = trimmed.match(/^(\d+)/);
        blocks.push({
          type: 'numbered',
          indent,
          text: trimmed.replace(/^\d+\.\s*/, ''),
          number: numMatch ? parseInt(numMatch[1]) : 1
        });
        i++; continue;
      }

      if (/^[-*•]\s/.test(trimmed)) {
        const indent = this.getIndentLevel(rawLine);
        blocks.push({
          type: 'bullet',
          indent,
          text: trimmed.replace(/^[-*•]\s*/, '')
        });
        i++; continue;
      }

      const indent = this.getIndentLevel(rawLine);
      blocks.push({ type: 'paragraph', indent, text: trimmed });
      i++;
    }

    return blocks;
  },

  parseTable(lines, opts = {}) {
    const valid = lines.filter(l => l.trim().startsWith('|'));
    if (valid.length < 2) return null;

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

    const rows = valid.slice(dataStart).map(line => {
      const cells = this.splitRow(line);
      while (cells.length < headers.length) cells.push('');
      return cells.slice(0, headers.length);
    });

    const firstHeader = (headers[0] || '').toLowerCase().trim();
    const autonumber = opts.autonumber ||
                       firstHeader === 'no' ||
                       firstHeader === 'no.' ||
                       firstHeader === '#';

    if (autonumber) {
      rows.forEach((row, i) => {
        if (!row[0] || !row[0].trim()) row[0] = String(i + 1);
      });
    }

    let colWidths;
    if (opts.width && opts.width.length === headers.length) {
      const total = opts.width.reduce((a, b) => a + b, 0);
      colWidths = opts.width.map(w => (w / total) * 100);
    } else {
      colWidths = this.computeColumnWidths(headers, rows);
    }

    return {
      type: 'table',
      headers,
      rows,
      colWidths,
      aligns,
      style: opts.style || null,
      fontSize: opts.fontSize || null,
      autonumber
    };
  },

  splitRow(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s.split('|').map(c => c.trim());
  },

  computeColumnWidths(headers, rows) {
    const colCount = headers.length;
    const MIN_PCT = 8;
    const MAX_PCT = 55;

    const lengths = new Array(colCount).fill(0);
    for (let c = 0; c < colCount; c++) {
      lengths[c] = headers[c].length;
      for (const row of rows) {
        lengths[c] = Math.max(lengths[c], (row[c] || '').length);
      }
      lengths[c] = Math.max(lengths[c], 3);
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
      else if (ch === ' ') level += 0.5;
      else break;
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
          return indent + (block.number || 1) + '. ' + block.text;
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

          md += '| ' + block.headers.map(h => h || ' ').join(' | ') + ' |\n';
          md += '|' + block.headers.map((_, i) => {
            const a = (block.aligns && block.aligns[i]) || 'left';
            if (a === 'center') return ':---:';
            if (a === 'right') return '---:';
            return '---';
          }).join('|') + '|\n';
          block.rows.forEach(row => {
            md += '| ' + block.headers.map((_, i) => row[i] || ' ').join(' | ') + ' |\n';
          });
          return md.trimEnd();
        }
        default: return '';
      }
    }).filter(Boolean).join('\n\n');
  }
};

export default Parser;