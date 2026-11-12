// Builds a minimal one-page text PDF from plain text, without dependencies. Used to turn
// shared/samples/*.txt into the sample PDFs (vite.config.ts) so the pdf.js path is exercised.
// - ASCII text: standard Courier font (WinAnsi), one text line per document line.
// - Other text (Korean): a Type0 font with Identity-H encoding where each glyph id is the
//   character's code point, plus a ToUnicode CMap so text extraction is exact. The font is not
//   embedded, so viewers may render substitute glyphs; extraction does not depend on them.

const pdfString = (s) => `(${s.replace(/[\\()]/g, (c) => `\\${c}`)})`;
const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');

/** @param {string} text @returns {Uint8Array} */
export function makeTextPdf(text) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  const ascii = /^[\x20-\x7E\n]*$/.test(lines.join('\n'));
  const size = 9;
  const leading = 12;
  const top = 756;
  if (lines.length * leading > top - 36) throw new Error('text does not fit on one page');

  const codePoints = new Set();
  const encodeLine = (line) => {
    if (ascii) return pdfString(line);
    let hex = '';
    for (const ch of line) {
      const cp = ch.codePointAt(0);
      if (cp > 0xffff) throw new Error('only BMP characters are supported');
      codePoints.add(cp);
      hex += hex4(cp);
    }
    return `<${hex}>`;
  };
  const body = lines.map((line, i) => `1 0 0 1 36 ${top - i * leading} Tm ${encodeLine(line)} Tj`).join('\n');
  const stream = `BT /F1 ${size} Tf\n${body}\nET`;

  const objects = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>');
  objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
  if (ascii) {
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  } else {
    objects.push('<< /Type /Font /Subtype /Type0 /BaseFont /SilhouetteSample /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>');
    const widths = [...codePoints].sort((a, b) => a - b).map((cp) => `${cp} [${cp < 0x1100 ? 600 : 1000}]`).join(' ');
    objects.push(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /SilhouetteSample /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 8 0 R /DW 1000 /W [${widths}] /CIDToGIDMap /Identity >>`);
    const ranges = [...codePoints].sort((a, b) => a - b).map((cp) => `<${hex4(cp)}> <${hex4(cp)}>`);
    const chunks = [];
    for (let i = 0; i < ranges.length; i += 100) {
      const part = ranges.slice(i, i + 100);
      chunks.push(`${part.length} beginbfchar\n${part.join('\n')}\nendbfchar`);
    }
    const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Silhouette-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${chunks.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
    objects.push(`<< /Length ${Buffer.byteLength(cmap, 'latin1')} >>\nstream\n${cmap}\nendstream`);
    objects.push('<< /Type /FontDescriptor /FontName /SilhouetteSample /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 >>');
  }

  let pdf = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}
