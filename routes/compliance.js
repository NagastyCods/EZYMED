const express = require('express');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/roles');
const {
  getPrivacyNotice,
  getRegulatoryInfo,
  exportPatientData,
} = require('../services/complianceService');
const { getConsentOptionsForRegistration } = require('../services/consentService');

const router = express.Router();

router.get('/privacy-notice', (_req, res) => {
  res.json(getPrivacyNotice());
});

router.get('/regulatory-info', (_req, res) => {
  res.json(getRegulatoryInfo());
});

router.get('/consent-options', (_req, res) => {
  res.json({ options: getConsentOptionsForRegistration() });
});

router.get('/patient/export', auth, requirePermission(PERMISSIONS.DATA_EXPORT), async (req, res) => {
  try {
    const pdfBuffer = await exportPatientData(req.patientId, req);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ezymed-export-${new Date().toISOString().slice(0, 10)}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
