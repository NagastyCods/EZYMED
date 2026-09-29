function escapePdfText(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, '')
    .replace(/\n/g, ' ');
}

function formatDateTime(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function wrapText(text, maxChars) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length <= maxChars) {
      cur = (cur + ' ' + w).trim();
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function renderLine(text, font, size, x, y) {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`;
}

function buildPatientExportPdf(data) {
  const title = 'EZYMED Patient Data Export';
  const patientName = [data.patient?.firstName, data.patient?.lastName].filter(Boolean).join(' ') || 'Unknown patient';

  const lines = [];
  lines.push(title);
  lines.push(`Exported at: ${formatDateTime(data.exportedAt)}`);
  lines.push(`Patient: ${patientName}`);
  lines.push(`Email: ${data.patient?.email || 'Not provided'}`);
  lines.push('');

  const sections = [
    { title: 'Appointments', items: (data.appointments || []).map((a) => `${formatDateTime(a.scheduledAt)} — ${a.doctorName || 'Doctor'} — ${a.status || 'unknown'}`) },
    { title: 'Symptom Assessments', items: (data.symptomAssessments || []).map((s) => `${formatDateTime(s.createdAt)} — ${s.urgency || 'unknown'} — ${s.recommendationTitle || s.department || ''}`) },
    { title: 'Consultations', items: (data.consultations || []).map((c) => `${formatDateTime(c.createdAt)} — ${c.mode || 'mode'} — ${c.status || 'unknown'} — ${c.doctorName || 'Unassigned'}`) },
    { title: 'Consultation Messages', items: (data.consultationMessages || []).slice(0, 100).map((m) => `${formatDateTime(m.createdAt)} — ${m.senderName || m.senderType}: ${String(m.content || '').slice(0, 80)}`) },
    { title: 'Clinical Records', items: (data.clinicalRecords || []).map((r) => `${formatDateTime(r.createdAt)} — ${r.type}: ${r.title}`) },
    { title: 'Doctor Notes', items: (data.doctorNotes || []).map((n) => `${formatDateTime(n.createdAt)} — ${n.title}: ${String(n.content || '').slice(0, 80)}`) },
    { title: 'Pharmacy Orders', items: (data.pharmacyOrders || []).map((o) => `${formatDateTime(o.createdAt)} — ${o.medication} — ${o.status}`) },
    { title: 'Queue History', items: (data.queueHistory || []).map((q) => `${formatDateTime(q.createdAt)} — ${q.department} — ${q.status}`) },
    { title: 'Consents', items: (data.consents || []).map((c) => `${c.consentType || 'consent'} — ${c.granted ? 'granted' : 'not granted'}`) },
    { title: 'Access Audit Trail', items: (data.accessAuditTrail || []).map((e) => `${formatDateTime(e.createdAt)} — ${e.action || 'action'} — ${e.outcome || 'unknown'}`) },
  ];

  sections.forEach((s) => {
    lines.push('');
    lines.push(s.title);
    if (!s.items || s.items.length === 0) lines.push('- None');
    else s.items.forEach((item) => {
      wrapText(item, 90).forEach((l, idx) => {
        lines.push(idx === 0 ? `- ${l}` : `  ${l}`);
      });
    });
  });

  // Pagination settings
  const pageWidth = 612;
  const pageHeight = 792;
  const marginLeft = 50;
  const marginTop = 60;
  const marginBottom = 50;
  const lineHeight = 14;
  const usableHeight = pageHeight - marginTop - marginBottom;
  const linesPerPage = Math.floor(usableHeight / lineHeight);

  const pages = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }

  const contentObjects = pages.map((pageLines, pageIndex) => {
    const startY = pageHeight - marginTop;
    const parts = [];
    // Title only on first page
    if (pageIndex === 0) {
      parts.push(renderLine(title, 'F1', 16, marginLeft, startY));
    }
    // Render body lines
    pageLines.forEach((line, idx) => {
      const yOffset = pageIndex === 0 ? 30 : 0;
      const y = startY - yOffset - (idx * lineHeight) - (pageIndex === 0 ? 18 : 0);
      const font = line.startsWith('-') || line.startsWith('  ') ? 'F2' : 'F1';
      const size = line.startsWith('-') || line.startsWith('  ') ? 10 : 12;
      parts.push(renderLine(line, font, size, marginLeft, y));
    });
    // Footer with page number
    const footer = `Page ${pageIndex + 1} of ${pages.length}`;
    parts.push(renderLine(footer, 'F2', 9, marginLeft, marginBottom - 10));

    return parts.join(' ');
  });

  // Build PDF objects
  const objects = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`);

  // Page and content objects
  contentObjects.forEach((content, i) => {
    const pageObj = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R /F2 ${4 + pages.length * 2} 0 R >> >> >>`;
    objects.push(pageObj);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  });

  // Fonts
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const pdfParts = ['%PDF-1.4\n'];
  const offsets = [];
  let offset = Buffer.byteLength(pdfParts[0]);
  objects.forEach((object, index) => {
    offsets.push(offset);
    pdfParts.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
    offset += Buffer.byteLength(pdfParts[pdfParts.length - 1]);
  });

  const xrefOffset = offset;
  const totalObjects = objects.length;
  const xref = [`xref\n0 ${totalObjects + 1}\n`, '0000000000 65535 f \n'];
  offsets.forEach((value) => {
    xref.push(`${String(value).padStart(10, '0')} 00000 n \n`);
  });

  pdfParts.push(`${xref.join('')}trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.concat(pdfParts.map((part) => Buffer.from(part, 'utf8')));
}

module.exports = {
  buildPatientExportPdf,
};
