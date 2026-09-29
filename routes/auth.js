const express = require('express');
const jwt = require('jsonwebtoken');
const Patient = require('../models/Patient');
const auth = require('../middleware/auth');
const { accountRequiresMfa, signMfaPendingToken } = require('../services/mfaService');
const { applyRegistrationConsents } = require('../services/consentService');
const { logAudit } = require('../services/auditService');
const { getJwtSecret } = require('../config/secrets');
const { authRateLimit } = require('../middleware/rateLimit');
const {
  sendVerificationEmail,
  verifyEmail,
  resendVerificationEmail,
  requestPasswordReset,
  resetPassword,
} = require('../services/accountLifecycleService');

const router = express.Router();

const signToken = (id) =>
  jwt.sign({ id }, getJwtSecret(), {
    expiresIn: '7d',
  });

router.post('/register', authRateLimit, async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, dateOfBirth, consents } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ message: 'Email, password, first name, and last name are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const existing = await Patient.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const patient = await Patient.create({
      email,
      password,
      firstName,
      lastName,
      phone,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      insurance: {},
    });

    await applyRegistrationConsents(patient._id, consents || {}, req);

    try {
      await sendVerificationEmail(patient);
    } catch {
      /* registration succeeds even if email delivery fails */
    }

    await logAudit({
      actorRole: 'patient',
      actorId: patient._id.toString(),
      actorName: `${patient.firstName} ${patient.lastName}`,
      action: 'auth.register',
      patientId: patient._id,
      req,
    });

    const token = signToken(patient._id);

    res.status(201).json({
      message: 'Registration successful. Check your email to verify your account.',
      token,
      patient: patient.toPublicJSON(),
      emailVerificationSent: true,
    });
  } catch (err) {
    const status = err.code === 'CONSENT_REQUIRED' ? 400 : 500;
    res.status(status).json({ message: err.message || 'Registration failed', code: err.code });
  }
});

router.post('/login', authRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const patient = await Patient.findOne({ email: email.toLowerCase() }).select('+password +mfaSecret');
    if (!patient || !(await patient.comparePassword(password))) {
      await logAudit({
        actorRole: 'patient',
        actorId: email,
        action: 'auth.login_failed',
        outcome: 'failure',
        req,
      });
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (accountRequiresMfa(patient)) {
      return res.json({
        message: 'MFA verification required',
        requiresMfa: true,
        mfaToken: signMfaPendingToken({
          role: 'patient',
          id: patient._id.toString(),
          name: `${patient.firstName} ${patient.lastName}`,
        }),
      });
    }

    await logAudit({
      actorRole: 'patient',
      actorId: patient._id.toString(),
      actorName: `${patient.firstName} ${patient.lastName}`,
      action: 'auth.login',
      patientId: patient._id,
      req,
    });

    res.json({
      message: 'Login successful',
      token: signToken(patient._id),
      patient: patient.toPublicJSON(),
      emailVerified: patient.emailVerified,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Login failed' });
  }
});

router.get('/me', auth, async (req, res) => {
  res.json({ patient: req.patient.toPublicJSON(), emailVerified: req.patient.emailVerified });
});

router.post('/verify-email', authRateLimit, async (req, res) => {
  try {
    const { email, token } = req.body;
    if (!email || !token) {
      return res.status(400).json({ message: 'Email and verification token are required' });
    }
    const patient = await verifyEmail(email, token);
    res.json({ message: 'Email verified successfully', patient: patient.toPublicJSON() });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/resend-verification', authRateLimit, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });
    await resendVerificationEmail(email);
    res.json({ message: 'If an unverified account exists, a verification email has been sent.' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/forgot-password', authRateLimit, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });
    await requestPasswordReset(email);
    res.json({ message: 'If an account exists for that email, password reset instructions have been sent.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/reset-password', authRateLimit, async (req, res) => {
  try {
    const { email, token, password } = req.body;
    if (!email || !token || !password) {
      return res.status(400).json({ message: 'Email, token, and new password are required' });
    }
    await resetPassword(email, token, password);
    res.json({ message: 'Password reset successful. You can sign in with your new password.' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
