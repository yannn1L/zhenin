/* ============================================================
   ZHENIN - DOCX Exporter (v2.8.0 MAJOR FIX)
   
   FIX LIST:
   - CB5: List hanging dynamic (support nomor 2 digit+)
   - CB6: Nested list di DOCX proper
   - CB7: <br> di paragraph → break: 1 (line break proper)
   - CB24: H1 dengan : tetap 1 baris (konsisten preview)
   - CB25: ol start attribute
   - CB27: Numbered list pakai block.number (sudah auto-increment di parser)
   - Border size 6 (0.75pt = 1px)
   - Font size 20 (10pt) konsisten preview
   - Typo "Instructure" → "Instructor"
   - Sanitize control chars
   ============================================================ */

import { CONFIG } from './config.js';
import { Data } from './storage.js';
import Parser from './parser.js';
import Renderer from './renderer.js';

export const Exporter = {
  async exportDocx(markdown, options = {}) {
    const d = window.docx;
    if (!d) throw new Error('Library docx tidak ditemukan');

    const content = String(markdown || '').trim();
    if (!content || content.length < 50) {
      throw new Error('Konten dokumen kosong atau terlalu pendek (min 50 char)');
    }

    const {
      Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
      WidthType, AlignmentType, BorderStyle, VerticalAlign, HeightRule,
      TableLayoutType, PageBreak, convertMillimetersToTwip
    } = d;

    const FONT = 'Times New Roman';
    const FONT_SIZE = 24;           // 12pt body
    const FONT_SIZE_TABLE = 20;      // 10pt (konsisten preview)
    const LINE_SPACING = 360;        // 1.5 line spacing

    const PAGE_WIDTH = convertMillimetersToTwip(210);
    const PAGE_HEIGHT = convertMillimetersToTwip(297);
    const MARGIN_LEFT = convertMillimetersToTwip(40);
    const MARGIN_RIGHT = convertMillimetersToTwip(30);
    const MARGIN_TOP = convertMillimetersToTwip(30);
    const MARGIN_BOTTOM = convertMillimetersToTwip(30);
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

    const blocks = Parser.parse(content);
    if (!blocks.length) throw new Error('Tidak ada konten valid');

    const ctx = {
      FONT, FONT_SIZE, FONT_SIZE_TABLE, LINE_SPACING, CONTENT_WIDTH,
      Paragraph, TextRun, Table, TableRow, TableCell,
      WidthType, AlignmentType, BorderStyle, VerticalAlign, HeightRule,
      TableLayoutType, PageBreak,
      _self: this
    };

    const children = [];

    if (options.title) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: LINE_SPACING, after: 240 },
        children: [new TextRun({
          text: this.sanitizeText(options.title),
          bold: true, font: FONT, size: 28
        })]
      }));
    }

    // ⚠️ CB6: Group consecutive list blocks untuk nested handling
    const grouped = this.groupListBlocks(blocks);

    for (const item of grouped) {
      if (item._grouped) {
        this.renderListGroup(item.blocks, children, ctx, 0);
      } else {
        this.renderBlock(item, children, ctx);
      }
    }

    const doc = new Document({
      styles: {
        default: {
          document: { run: { font: FONT, size: FONT_SIZE } }
        }
      },
      sections: [{
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: {
              top: MARGIN_TOP, right: MARGIN_RIGHT,
              bottom: MARGIN_BOTTOM, left: MARGIN_LEFT
            }
          }
        },
        children
      }]
    });

    const blob = await Packer.toBlob(doc);

    const safeName = this.sanitizeFilename(options.filename || 'Dokumen');
    const datePart = new Date().toISOString().slice(0, 10);
    const timePart = Date.now().toString(36).slice(-4);
    const docIdShort = options.docId ? options.docId.slice(-4) : timePart;
    const finalName = `${safeName}_${datePart}_${docIdShort}.docx`;

    if (window.saveAs) {
      window.saveAs(blob, finalName);
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    return { success: true, filename: finalName };
  },

  /**
   * Group consecutive list blocks
   */
  groupListBlocks(blocks) {
    const result = [];
    let i = 0;

    while (i < blocks.length) {
      const block = blocks[i];

      if (block.type === 'numbered' || block.type === 'bullet') {
        const group = [];
        while (i < blocks.length &&
               (blocks[i].type === 'numbered' || blocks[i].type === 'bullet')) {
          group.push(blocks[i]);
          i++;
        }
        result.push({ _grouped: true, blocks: group });
      } else {
        result.push(block);
        i++;
      }
    }

    return result;
  },

  /**
   * Render list group dengan nested handling
   * ⚠️ CB6: Nested list di-render dengan indent + bullet style berbeda
   */
  renderListGroup(listBlocks, out, ctx, baseLevel) {
    const tree = this.buildListTree(listBlocks);
    this.renderListLevel(tree, out, ctx, baseLevel);
  },

  buildListTree(blocks) {
    const root = [];
    const stack = [{ children: root, indent: -1 }];

    for (const block of blocks) {
      const indent = block.indent || 0;

      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      const node = {
        type: block.type,
        text: block.text,
        number: block.number,
        indent: indent,
        children: []
      };

      stack[stack.length - 1].children.push(node);
      stack.push(node);
    }

    return root;
  },

  renderListLevel(nodes, out, ctx, baseLevel) {
    const { FONT, FONT_SIZE, LINE_SPACING } = ctx;
    const self = ctx._self;

    // Group by type
    const groups = [];
    let currentGroup = null;

    for (const node of nodes) {
      if (!currentGroup || currentGroup.type !== node.type) {
        currentGroup = { type: node.type, items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(node);
    }

    for (const group of groups) {
      for (const node of group.items) {
        const depth = baseLevel + node.indent;

        // ⚠️ CB5: Dynamic hanging berdasarkan panjang nomor
        let bulletText;
        if (group.type === 'bullet') {
          const bulletChar = depth === 0 ? '•  ' :
                            depth === 1 ? '○  ' :
                            depth === 2 ? '▪  ' :
                            '·  ';
          bulletText = bulletChar;
        } else {
          bulletText = `${node.number || 1}.  `;
        }

        // Dynamic hanging: minimum 360 twips (0.25in), atau sesuai panjang bullet
        const hanging = Math.max(360, bulletText.length * 130);

        // Indent berdasarkan depth
        const indentLeft = 720 + (depth * 360);

        const children = [
          new ctx.TextRun({ text: bulletText, font: FONT, size: FONT_SIZE }),
          ...self.buildRunsWithBr(node.text, ctx, {})
        ];

        out.push(new ctx.Paragraph({
          alignment: ctx.AlignmentType.JUSTIFIED,
          indent: { left: indentLeft, hanging: hanging },
          spacing: { line: LINE_SPACING, after: 60 },
          children
        }));

        // Render nested children
        if (node.children.length > 0) {
          this.renderListLevel(node.children, out, ctx, baseLevel);
        }
      }
    }
  },

  sanitizeText(str) {
    return String(str == null ? '' : str)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  },

  /**
   * ⚠️ CB7: Build runs dengan <br> → break: 1
   * <br> di paragraph jadi line break, bukan multiple paragraph
   */
  buildRunsWithBr(text, ctx, opts = {}) {
    const { FONT, FONT_SIZE } = ctx;
    const repl = (t) => Renderer.replacePlaceholders(t);
    const sanitize = (t) => this.sanitizeText(t);

    const sanitized = sanitize(repl(text));
    const runs = Parser.parseInline(sanitized);

    const textRuns = [];
    let pendingBreak = false;

    for (const r of runs) {
      if (r.type === 'br') {
        pendingBreak = true;
        continue;
      }

      const o = {
        text: r.text || ' ',
        bold: r.bold || opts.bold || false,
        italics: r.italic || opts.italic || false,
        underline: r.underline ? {} : undefined,
        strike: r.strike || false,
        font: FONT,
        size: opts.size || FONT_SIZE
      };

      if (pendingBreak) {
        o.break = 1;
        pendingBreak = false;
      }

      if (r.highlight) o.highlight = 'yellow';
      textRuns.push(new ctx.TextRun(o));
    }

    return textRuns.length > 0
      ? textRuns
      : [new ctx.TextRun({ text: ' ', font: FONT, size: opts.size || FONT_SIZE })];
  },

  renderBlock(block, out, ctx) {
    const { FONT, FONT_SIZE, LINE_SPACING } = ctx;
    const self = this;

    switch (block.type) {
      case 'h1': {
        // ⚠️ CB24: Konsisten 1 baris (tidak split dengan :)
        const txt = self.sanitizeText(Renderer.replacePlaceholders(block.text));
        out.push(new ctx.Paragraph({
          alignment: ctx.AlignmentType.CENTER,
          spacing: { line: LINE_SPACING, before: 0, after: 240 },
          children: [new ctx.TextRun({
            text: txt.toUpperCase(),
            bold: true, font: FONT, size: FONT_SIZE
          })]
        }));
        break;
      }
      case 'h2':
        out.push(new ctx.Paragraph({
          spacing: { line: LINE_SPACING, before: 240, after: 120 },
          children: self.buildRunsWithBr(block.text, ctx, { bold: true })
        }));
        break;
      case 'h3':
        out.push(new ctx.Paragraph({
          spacing: { line: LINE_SPACING, before: 200, after: 100 },
          children: self.buildRunsWithBr(block.text, ctx, { bold: true })
        }));
        break;
      case 'h4':
        out.push(new ctx.Paragraph({
          indent: { left: 360 },
          spacing: { line: LINE_SPACING, before: 160, after: 80 },
          children: self.buildRunsWithBr(block.text, ctx, { bold: true, italic: true })
        }));
        break;

      case 'paragraph': {
        const txt = self.sanitizeText(Renderer.replacePlaceholders(block.text));
        if (txt.trim() === '__IDENTITAS_MHS_MARKER__') {
          out.push(this.buildIdentityTable(ctx));
          out.push(new ctx.Paragraph({ spacing: { after: 120 }, children: [] }));
          break;
        }

        const indentLevel = block.indent || 0;
        let indentConfig;
        if (indentLevel === 0) {
          indentConfig = { firstLine: 720 };
        } else {
          indentConfig = { left: indentLevel * 720, firstLine: 0 };
        }

        out.push(new ctx.Paragraph({
          alignment: ctx.AlignmentType.JUSTIFIED,
          indent: indentConfig,
          spacing: { line: LINE_SPACING, after: 120 },
          children: self.buildRunsWithBr(block.text, ctx, {})
        }));
        break;
      }

      // Numbered & bullet di-handle oleh renderListGroup
      case 'numbered':
      case 'bullet':
        break;

      case 'quote':
        out.push(new ctx.Paragraph({
          indent: { left: 720 },
          spacing: { line: LINE_SPACING, after: 120 },
          children: self.buildRunsWithBr(block.text, ctx, { italic: true })
        }));
        break;

      case 'hr':
        out.push(new ctx.Paragraph({
          border: {
            bottom: { style: ctx.BorderStyle.SINGLE, size: 6, color: '000000', space: 1 }
          },
          spacing: { after: 200 },
          children: []
        }));
        break;

      case 'pagebreak':
        out.push(new ctx.Paragraph({ children: [new ctx.PageBreak()] }));
        break;

      case 'signature':
        out.push(this.buildSignatureTable(ctx));
        break;

      case 'image':
        out.push(this.buildImagePlaceholder(block, ctx));
        out.push(new ctx.Paragraph({ spacing: { after: 120 }, children: [] }));
        break;

      case 'table':
        out.push(this.buildTable(block, ctx));
        out.push(new ctx.Paragraph({ spacing: { after: 120 }, children: [] }));
        break;
    }
  },

  buildTable(block, ctx) {
    const {
      FONT, FONT_SIZE_TABLE, CONTENT_WIDTH,
      Paragraph, TextRun, Table, TableRow, TableCell,
      WidthType, AlignmentType, BorderStyle, VerticalAlign, HeightRule,
      TableLayoutType
    } = ctx;

    const BRD = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
    const cb = { top: BRD, bottom: BRD, left: BRD, right: BRD };

    const colW = block.colWidths.map(p => Math.round((p / 100) * CONTENT_WIDTH));

    let tableFontSize = FONT_SIZE_TABLE;
    if (block.fontSize) tableFontSize = Math.round(block.fontSize * 2);
    else if (block.style === 'small') tableFontSize = 18;
    else if (block.style === 'large') tableFontSize = 22;

    const self = this;

    function makeCell(text, opts = {}) {
      const { bold = false, align = 'left', shade = null } = opts;
      const docxAlign = align === 'center' ? AlignmentType.CENTER
                       : align === 'right' ? AlignmentType.RIGHT
                       : AlignmentType.LEFT;

      // Split by <br> → multiple Paragraph
      const rawText = String(text == null ? '' : text);
      const parts = rawText.split(/<br\s*\/?>/i);

      const paragraphs = parts.map((part, idx) => {
        const replaced = Renderer.replacePlaceholders(part);
        const sanitized = self.sanitizeText(replaced);
        const runs = Parser.parseInline(sanitized).filter(r => r.type !== 'br');

        const children = runs.length > 0
          ? runs.map(r => {
              const o = {
                text: r.text || ' ',
                bold: r.bold || bold,
                italics: r.italic || false,
                underline: r.underline ? {} : undefined,
                strike: r.strike || false,
                font: FONT,
                size: tableFontSize
              };
              if (r.highlight) o.highlight = 'yellow';
              return new TextRun(o);
            })
          : [new TextRun({ text: ' ', font: FONT, size: tableFontSize })];

        return new Paragraph({
          alignment: docxAlign,
          spacing: {
            line: 280,
            before: idx === 0 ? 40 : 0,
            after: idx === parts.length - 1 ? 40 : 0
          },
          children
        });
      });

      const o = {
        borders: cb,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: paragraphs
      };
      if (shade) o.shading = { fill: shade, type: 'clear', color: 'auto' };
      return new TableCell(o);
    }

    return new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: colW,
      rows: [
        new TableRow({
          tableHeader: true,
          height: { value: 300, rule: HeightRule.ATLEAST },
          children: block.headers.map((h, i) => makeCell(h, {
            bold: true,
            align: block.aligns?.[i] || 'center',
            shade: 'D9D9D9'
          }))
        }),
        ...block.rows.map(row => new TableRow({
          height: { value: 240, rule: HeightRule.ATLEAST },
          children: row.map((c, i) => makeCell(c, {
            align: block.aligns?.[i] || 'left'
          }))
        }))
      ],
      borders: cb
    });
  },

  buildIdentityTable(ctx) {
    const {
      FONT, FONT_SIZE, CONTENT_WIDTH,
      Paragraph, TextRun, Table, TableRow, TableCell,
      WidthType, VerticalAlign, BorderStyle, TableLayoutType
    } = ctx;

    const BRD = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
    const cb = { top: BRD, bottom: BRD, left: BRD, right: BRD };
    const LEFT_W = Math.floor(CONTENT_WIDTH * 0.35);
    const RIGHT_W = CONTENT_WIDTH - LEFT_W;

    const p = Data.getProfile();
    const self = this;

    const replaceValue = (val) => {
      if (!val || val === '-') return '-';
      const replaced = Renderer.replacePlaceholders(val);
      return self.sanitizeText(replaced);
    };

    const rows = [
      ['Nama', replaceValue(p.nama) || '-'],
      ['NIM', replaceValue(p.nim) || '-'],
      ['Kelompok', replaceValue(p.kelompok) || '-'],
      ['Tempat Praktik', replaceValue(p.tempatPraktik) || '-'],
      ['Periode Praktik', replaceValue(p.periodePraktik) || '-'],
      ['Clinical Instruktur', replaceValue(p.ci) || '-']
    ];

    function makeCell(text, opts = {}) {
      const { bold = false, width = LEFT_W } = opts;
      return new TableCell({
        borders: cb,
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        width: { size: width, type: WidthType.DXA },
        children: [new Paragraph({
          spacing: { line: 300, before: 40, after: 40 },
          children: [new TextRun({
            text: String(text || '-'),
            bold, font: FONT, size: FONT_SIZE
          })]
        })]
      });
    }

    return new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [LEFT_W, RIGHT_W],
      rows: rows.map(([label, value]) => new TableRow({
        children: [
          makeCell(label, { bold: true, width: LEFT_W }),
          makeCell(value, { width: RIGHT_W })
        ]
      })),
      borders: cb
    });
  },

  buildSignatureTable(ctx) {
    const {
      FONT, FONT_SIZE, CONTENT_WIDTH,
      Paragraph, TextRun, Table, TableRow, TableCell,
      WidthType, AlignmentType, BorderStyle, VerticalAlign, HeightRule,
      TableLayoutType
    } = ctx;

    const BRD = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
    const cb = { top: BRD, bottom: BRD, left: BRD, right: BRD };
    const HALF = Math.floor(CONTENT_WIDTH / 2);
    const HALF2 = CONTENT_WIDTH - HALF;

    function makeCell(text, opts = {}) {
      const { vAlign = VerticalAlign.CENTER } = opts;
      return new TableCell({
        borders: cb,
        margins: { top: 120, bottom: 120, left: 150, right: 150 },
        verticalAlign: vAlign,
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { line: 300, before: 60, after: 60 },
          children: [new TextRun({ text, font: FONT, size: FONT_SIZE })]
        })]
      });
    }

    return new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [HALF, HALF2],
      rows: [
        new TableRow({
          height: { value: 1400, rule: HeightRule.ATLEAST },
          children: [
            makeCell('Yang Membuat/Mahasiswa', { vAlign: VerticalAlign.TOP }),
            makeCell('Yang Memverifikasi/Clinical Instructor (CI)', { vAlign: VerticalAlign.TOP })
          ]
        }),
        new TableRow({
          height: { value: 400, rule: HeightRule.ATLEAST },
          children: [
            makeCell('Nama Lengkap & Tanda Tangan'),
            makeCell('Nama Lengkap & Tanda Tangan')
          ]
        })
      ],
      borders: cb
    });
  },

  buildImagePlaceholder(block, ctx) {
    const {
      FONT, CONTENT_WIDTH,
      Paragraph, TextRun, Table, TableRow, TableCell,
      WidthType, AlignmentType, BorderStyle, VerticalAlign
    } = ctx;

    const BRD = { style: BorderStyle.DASHED, size: 6, color: '999999' };
    const cb = { top: BRD, bottom: BRD, left: BRD, right: BRD };
    const cap = this.sanitizeText(Renderer.replacePlaceholders(block.caption));

    return new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      rows: [new TableRow({
        children: [new TableCell({
          borders: cb,
          margins: { top: 200, bottom: 200, left: 200, right: 200 },
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { line: 360, before: 800, after: 400 },
              children: [new TextRun({
                text: '[ Sisipkan gambar di sini ]',
                italics: true, color: '999999', font: FONT, size: 22
              })]
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 800 },
              children: [new TextRun({
                text: `Gambar: ${cap}`,
                italics: true, font: FONT, size: 20
              })]
            })
          ]
        })]
      })],
      borders: cb
    });
  },

  sanitizeFilename(name) {
    return String(name || 'Dokumen')
      .replace(/[\\/:*?"<>|\x00-\x1F]+/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 80) || 'Dokumen';
  }
};

export default Exporter;