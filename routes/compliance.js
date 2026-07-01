const express = require('express');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/roles');
const {
  getPrivacyNotice,
  getRegulatoryInfo,
  exportPatientData,
} = require('../services/complianceService');

const router = express.Router();

router.get('/privacy-notice', (_req, res) => {
  res.json(getPrivacyNotice());
});

router.get('/regulatory-info', (_req, res) => {
  res.json(getRegulatoryInfo());
});

router.get('/patient/export', auth, requirePermission(PERMISSIONS.DATA_EXPORT), async (req, res) => {
  try {
    const data = await exportPatientData(req.patientId, req);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
