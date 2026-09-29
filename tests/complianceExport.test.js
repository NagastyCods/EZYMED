const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPatientExportPdf } = require('../services/pdfExportService');

test('buildPatientExportPdf returns a PDF buffer for patient export data', () => {
  const pdf = buildPatientExportPdf({
    exportedAt: '2026-01-01T00:00:00.000Z',
    patient: { firstName: 'Ada', lastName: 'Lovelace' },
    appointments: [],
    symptomAssessments: [],
    consents: [],
    accessAuditTrail: [],
  });

  assert.ok(Buffer.isBuffer(pdf));
  assert.match(pdf.toString('latin1').slice(0, 5), /^%PDF-/);
  assert.ok(pdf.length > 100);
});
