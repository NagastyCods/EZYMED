const express = require('express');
const jwt = require('jsonwebtoken');
const Patient = require('../models/Patient');
const auth = require('../middleware/auth');
const { accountRequiresMfa, signMfaPendingToken } = require('../services/mfaService');
const { seedDefaultConsents } = require('../services/consentService');
const { logAudit } = require('../services/auditService');

const router = express.Router();

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET || 'ezymed-dev-secret-change-in-production', {
    expiresIn: '7d',
  });

router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, dateOfBirth } = req.body;

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

    await seedDefaultConsents(patient._id, req);

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
      message: 'Registration successful',
      token,
      patient: patient.toPublicJSON(),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
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
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Login failed' });
  }
});

router.get('/me', auth, async (req, res) => {
  res.json({ patient: req.patient.toPublicJSON() });
});

module.exports = router;
