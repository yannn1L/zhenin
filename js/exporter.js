/* ============================================================
   ZHENIN - DOCX Exporter (v2.6.0)
   FIX: empty content guard, filename unique per doc
   ============================================================ */

import { CONFIG } from './config.js';
import { Data } from './storage.js';
import Parser from './parser.js';
import Renderer from './renderer.js';

export const Exporter = {
  async exportDocx(markdown, options = {}) {
    const d = window.docx;
    if (!d) throw new Error('Library docx tidak ditemukan');

    // ⚠️ Verify content
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
    const FONT_SIZE = 24;
    const FONT_SIZE_TABLE = 22;
    const LINE_SPACING = 360;

    const PAGE_WIDTH = convertMillimetersToTwip(210);
    const PAGE_HEIGHT = convertMillimetersToTwip(297);
    const MARGIN_LEFT = convertMillimetersToTwip(40);
    const MARGIN_RIGHT = convertMillimetersToTwip(30);
    const MARGIN_TOP = convertMillimetersToTwip(30);
    const MARGIN_BOTTOM = convertMillimetersToTwip(30);
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

    // Parse
    const blocks = Parser.parse(content);
    if (!blocks.length) throw new Error('Tidak ada konten valid');

    const ctx = {
      FONT, FONT_SIZE, FONT_SIZE_TABLE, LINE_SPACING, CONTENT_WIDTH,
      Paragraph, TextRun, Table, TableRow, TableCell,
      WidthType, AlignmentType, BorderStyle, VerticalAlign, HeightRule,
      TableLayoutType, PageBreak
    };

    const children = [];

    if (options.title) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: LINE_SPACING, after: 240 },
        children: [new TextRun({
          text: options.title,
          bold: true, font: FONT, size: 28
        })]
      }));
    }

    for (const block of blocks) {
      this.renderBlock(block, children, ctx);
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

    // ⚠️ FIX: Unique filename dengan docId untuk prevent cache
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

  renderBlock(block, out, ctx) {
    const { FONT, FONT_SIZE, LINE_SPACING } = ctx;
    const repl = (t) => Renderer.replacePlaceholders(t);

    const buildRuns = (text, opts = {}) => {
      const runs = Parser.parseInline(repl(text));
      return runs.map(r => {
        const o = {
          text: r.text || ' ',
          bold: r.bold || opts.bold || false,
          italics: r.italic || opts.italic || false,
          underline: r.underline ? {} : undefined,
          strike: r.strike || false,
          font: FONT,
          size: opts.size || FONT_SIZE
        };
        if (r.highlight) o.highlight = 'yellow';
        return new ctx.TextRun(o);
      });
    };

    switch (block.type) {
      case 'h1': {
        const txt = repl(block.text);
        const idx = txt.indexOf(':');
        const babLine = idx > -1 ? txt.slice(0, idx).trim() : txt;
        const titleLine = idx > -1 ? txt.slice(idx + 1).trim() : '';

        out.push(new ctx.Paragraph({
          alignment: ctx.AlignmentType.CENTER,
          spacing: { line: LINE_SPACING, before: 0, after: 0 },
          children: [new ctx.TextRun({
            text: babLine.toUpperCase(),
            bold: true, font: FONT, size: FONT_SIZE
          })]
        }));

        if (titleLine) {
          out.push(new ctx.Paragraph({
            alignment: ctx.AlignmentType.CENTER,
            spacing: { line: LINE_SPACING, before: 0, after: 240 },
            children: [new ctx.TextRun({
              text: titleLine.toUpperCase(),
              bold: true, font: FONT, size: FONT_SIZE
            })]
          }));
        }
        break;
      }
      case 'h2':
        out.push(new ctx.Paragraph({
          spacing: { line: LINE_SPACING, before: 240, after: 120 },
          children: buildRuns(block.text, { bold: true })
        }));
        break;
      case 'h3':
        out.push(new ctx.Paragraph({
          spacing: { line: LINE_SPACING, before: 200, after: 100 },
          children: buildRuns(block.text, { bold: true })
        }));
        break;
      case 'h4':
        out.push(new ctx.Paragraph({
          indent: { left: 360 },
          spacing: { line: LINE_SPACING, before: 160, after: 80 },
          children: buildRuns(block.text, { bold: true, italic: true })
        }));
        break;
      case 'paragraph': {
        const txt = repl(block.text);
        if (txt.trim() === '__IDENTITAS_MHS_MARKER__') {
          out.push(this.buildIdentityTable(ctx));
          out.push(new ctx.Paragraph({ spacing: { after: 120 }, children: [] }));
          break;
        }

        const isL0 = block.indent === 0;
        out.push(new ctx.Paragraph({
          alignment: ctx.AlignmentType.JUSTIFIED,
          indent: {
            left: isL0 ? 0 : block.indent * 720,
            firstLine: isL0 ? 720 : 0
          },
          spacing: { line: LINE_SPACING, after: 120 },
          children: buildRuns(block.text)
        }));
        break;
      }
      case 'numbered':
      case 'bullet': {
        const indent = (block.indent || 0) * 720;
        const bullet = block.type === 'bullet'
          ? (block.indent === 0 ? '•  ' : block.indent === 1 ? '○  ' : '■  ')
          : `${block.number || 1}.  `;

        out.push(new ctx.Paragraph({
          alignment: ctx.AlignmentType.JUSTIFIED,
          indent: { left: 720 + indent, hanging: 360 },
          spacing: { line: LINE_SPACING, after: 60 },
          children: [
            new ctx.TextRun({ text: bullet, font: FONT, size: FONT_SIZE }),
            ...buildRuns(block.text)
          ]
        }));
        break;
      }
      case 'quote':
        out.push(new ctx.Paragraph({
          indent: { left: 720 },
          spacing: { line: LINE_SPACING, after: 120 },
          children: buildRuns(block.text, { italic: true })
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

    const BRD = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
    const cb = { top: BRD, bottom: BRD, left: BRD, right: BRD };
    const colW = block.colWidths.map(p => Math.round((p / 100) * CONTENT_WIDTH));

    let tableFontSize = FONT_SIZE_TABLE;
    if (block.fontSize) tableFontSize = Math.round(block.fontSize * 2);
    else if (block.style === 'small') tableFontSize = 18;
    else if (block.style === 'large') tableFontSize = 24;

    function makeCell(text, opts = {}) {
      const { bold = false, align = 'left', shade = null } = opts;
      const docxAlign = align === 'center' ? AlignmentType.CENTER
                       : align === 'right' ? AlignmentType.RIGHT
                       : AlignmentType.LEFT;

      const runs = Parser.parseInline(Renderer.replacePlaceholders(text || ' '));
      const children = [new Paragraph({
        alignment: docxAlign,
        spacing: { line: 280, before: 40, after: 40 },
        children: runs.map(r => {
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
      })];

      const o = {
        borders: cb,
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children
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
          height: { value: 400, rule: HeightRule.ATLEAST },
          children: block.headers.map((h, i) => makeCell(h, {
            bold: true,
            align: block.aligns?.[i] || 'center',
            shade: 'D9D9D9'
          }))
        }),
        ...block.rows.map(row => new TableRow({
          height: { value: 360, rule: HeightRule.ATLEAST },
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

    const BRD = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
    const cb = { top: BRD, bottom: BRD, left: BRD, right: BRD };
    const LEFT_W = Math.floor(CONTENT_WIDTH * 0.35);
    const RIGHT_W = CONTENT_WIDTH - LEFT_W;

    const p = Data.getProfile();
    const rows = [
      ['Nama', p.nama || '-'],
      ['NIM', p.nim || '-'],
      ['Kelompok', p.kelompok || '-'],
      ['Tempat Praktik', p.tempatPraktik || '-'],
      ['Periode Praktik', p.periodePraktik || '-'],
      ['Clinical Instruktur', p.ci || '-']
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

    const BRD = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
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
            makeCell('Yang Memverifikasi/Clinical Instructure(CI)', { vAlign: VerticalAlign.TOP })
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
    const cap = Renderer.replacePlaceholders(block.caption);

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