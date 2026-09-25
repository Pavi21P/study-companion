export function casePdf(streams) {
  const objects = ['', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', ''];
  const kids = [];
  for (const stream of streams) {
    const pageId = objects.length + 1; kids.push(`${pageId} 0 R`);
    objects.push(`<< /Type /Page /Parent 3 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 2 0 R >> >> /Contents ${pageId+1} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects[0] = '<< /Type /Catalog /Pages 3 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  let pdf = '%PDF-1.4\n'; const offsets = [];
  objects.forEach((object,i) => { offsets.push(pdf.length); pdf += `${i+1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
export const textStream = text => `BT /F1 18 Tf 50 750 Td (${text}) Tj ET`;
