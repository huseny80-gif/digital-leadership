/** Small real PDF with page tree, font, stream and correct xref offsets.
 * Injection fixtures may supply catalog/annotation objects for inspection. */
export function passivePdf(label = "fixture", extras: { catalog?: string; page?: string; objects?: string[] } = {}): Buffer {
  const stream = `% ${label.replace(/[\r\n]/gu, " ")}\nBT /F1 12 Tf 20 50 Td (Study document) Tj ET\n`;
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R ${extras.catalog ?? ""} >>`,
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R ${extras.page ?? ""} >>`,
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", ...(extras.objects ?? []),
  ];
  let body = "%PDF-1.4\n"; const offsets: number[] = [];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(body)); body += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}
