import exportPdf from './exportPdf';

export default async function generateAssignmentPdf(pages: any[], opts?: { filename?: string; returnBlob?: boolean }) {
  // pages are objects with canvas content; we'll reuse exportPdf to capture DOM
  // For now expect pages to be simple objects; CreateAssignment passes Konva objects
  // Create temporary DOM wrappers with serialized content
  const wrappers = pages.length ? pages.map((p, i) => ({ id: `a-${i}`, html: `<div style="width:210mm;height:297mm;background:white;padding:32px">${JSON.stringify(p)}</div>` })) : [{ id: 'empty', html: '<div></div>' }];
  return exportPdf(wrappers as any, opts);
}
