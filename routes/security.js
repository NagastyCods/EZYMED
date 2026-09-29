const express = require('express');
const auth = require('../middleware/auth');
const { doctorAuth } = require('../middleware/doctorAuth');
const { adminAuth } = require('../middleware/adminAuth');
const { requirePermission, resolveRole } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/roles');
const {
  startMfaSetup,
  confirmMfaSetup,
  disableMfa,
  verifyMfaLogin,
  getMfaStatus,
} = require('../services/mfaService');
const {
  getPatientConsents,
  grantConsent,
  revokeConsent,
  CONSENT_LABELS,
} = require('../services/consentService');
const { getAuditLogs } = require('../services/auditService');
const { signDoctorToken } = require('../middleware/doctorAuth');
const { signPharmacyToken, pharmacyAuth } = require('../middleware/pharmacyAuth');
const jwt = require('jsonwebtoken');
const Patient = require('../models/Patient');
const { findDoctorById } = require('../config/doctors');
const { getJwtSecret } = require('../config/secrets');
const { mfaRateLimit } = require('../middleware/rateLimit');

const router = express.Router();

const signPatientToken = (id) =>
  jwt.sign({ id }, getJwtSecret(), { expiresIn: '7d' });

router.post('/mfa/verify-login', mfaRateLimit, async (req, res) => {
  try {
    const { mfaToken, code } = req.body;
    if (!mfaToken || !code) {
      return res.status(400).json({ message: 'MFA token and verification code are required' });
    }

    const pending = await verifyMfaLogin(mfaToken, code, req);

    if (pending.role === 'patient') {
      const patient = await Patient.findById(pending.id);
      if (!patient) return res.status(401).json({ message: 'Patient not found' });
      return res.json({
        message: 'Login successful',
        token: signPatientToken(patient._id),
        patient: patient.toPublicJSON(),
      });
    }

    if (pending.role === 'doctor') {
      const doctor = findDoctorById(pending.id);
      if (!doctor) return res.status(401).json({ message: 'Doctor not found' });
      return res.json({
        message: 'Login successful',
        token: signDoctorToken(doctor),
        doctor: { id: doctor.id, name: doctor.name, department: doctor.department, title: doctor.title },
      });
    }

    if (pending.role === 'admin') {
      const HospitalAdmin = require('../models/HospitalAdmin');
      const admin = await HospitalAdmin.findById(pending.id);
      if (!admin) return res.status(401).json({ message: 'Administrator not found' });
      const publicAdmin = { id: admin._id.toString(), email: admin.email, name: admin.name };
      const token = jwt.sign(
        { id: publicAdmin.id, role: 'admin', email: publicAdmin.email, name: publicAdmin.name },
        getJwtSecret(),
        { expiresIn: '12h' }
      );
      return res.json({ message: 'Login successful', token, admin: publicAdmin });
    }

    if (pending.role === 'pharmacist') {
      const { findPharmacyById } = require('../config/pharmacies');
      const pharmacy = findPharmacyById(pending.id);
      if (!pharmacy) return res.status(401).json({ message: 'Pharmacy not found' });
      return res.json({
        message: 'Login successful',
        token: signPharmacyToken(pharmacy),
        pharmacy: { id: pharmacy.id, name: pharmacy.name, address: pharmacy.address, phone: pharmacy.phone },
      });
    }

    res.status(400).json({ message: 'Unsupported role' });
  } catch (err) {
    res.status(401).json({ message: err.message });
  }
});

function anyAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (decoded.role === 'doctor') return doctorAuth(req, res, next);
    if (decoded.role === 'admin') return adminAuth(req, res, next);
    if (decoded.role === 'pharmacist') return pharmacyAuth(req, res, next);
    return auth(req, res, next);
  } catch {
    return auth(req, res, next);
  }
}

router.get('/mfa/status', anyAuth, async (req, res) => {
  try {
    const role = resolveRole(req);
    const id = role === 'patient'
      ? req.patientId
      : role === 'doctor'
        ? req.doctorId
        : role === 'pharmacist'
          ? req.pharmacyId
          : req.admin.id;
    const status = await getMfaStatus(role, id);
    res.json(status);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/mfa/setup', anyAuth, requirePermission(PERMISSIONS.MFA_MANAGE), async (req, res) => {
  try {
    const role = resolveRole(req);
    let id;
    let label;

    if (role === 'patient') {
      id = req.patientId;
      label = req.patient.email;
    } else if (role === 'doctor') {
      id = req.doctorId;
      label = req.doctor.name;
    } else if (role === 'pharmacist') {
      id = req.pharmacyId;
      label = req.pharmacy.name;
    } else {
      id = req.admin.id;
      label = req.admin.email;
    }

    const setup = await startMfaSetup(role, id, label);
    res.json({
      message: 'Scan the OTP URI in your authenticator app, then confirm with a code',
      otpauth: setup.otpauth,
      secret: setup.secret,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/mfa/confirm', anyAuth, requirePermission(PERMISSIONS.MFA_MANAGE), async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Verification code is required' });

    const role = resolveRole(req);
    const id = role === 'patient'
      ? req.patientId
      : role === 'doctor'
        ? req.doctorId
        : role === 'pharmacist'
          ? req.pharmacyId
          : req.admin.id;
    const result = await confirmMfaSetup(role, id, code, req);
    res.json({ message: 'Multi-factor authentication enabled', ...result });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/mfa/disable', anyAuth, requirePermission(PERMISSIONS.MFA_MANAGE), async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Verification code is required' });

    const role = resolveRole(req);
    const id = role === 'patient'
      ? req.patientId
      : role === 'doctor'
        ? req.doctorId
        : role === 'pharmacist'
          ? req.pharmacyId
          : req.admin.id;
    const result = await disableMfa(role, id, code, req);
    res.json({ message: 'Multi-factor authentication disabled', ...result });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/consents', auth, requirePermission(PERMISSIONS.CONSENT_MANAGE), async (req, res) => {
  try {
    const consents = await getPatientConsents(req.patientId);
    res.json({ consents, labels: CONSENT_LABELS });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/consents', auth, requirePermission(PERMISSIONS.CONSENT_MANAGE), async (req, res) => {
  try {
    const { consentType } = req.body;
    if (!consentType) return res.status(400).json({ message: 'consentType is required' });
    await grantConsent(req.patientId, consentType, req);
    const consents = await getPatientConsents(req.patientId);
    res.json({ message: 'Consent granted', consents });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/consents/:consentType', auth, requirePermission(PERMISSIONS.CONSENT_MANAGE), async (req, res) => {
  try {
    await revokeConsent(req.patientId, req.params.consentType, req);
    const consents = await getPatientConsents(req.patientId);
    res.json({ message: 'Consent revoked', consents });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/audit-logs', adminAuth, requirePermission(PERMISSIONS.AUDIT_READ), async (req, res) => {
  try {
    const logs = await getAuditLogs({
      limit: Number(req.query.limit) || 100,
      action: req.query.action,
      actorRole: req.query.actorRole,
      patientId: req.query.patientId,
      from: req.query.from,
      to: req.query.to,
    });
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
