const express = require('express');
const jwt = require('jsonwebtoken');
const Patient = require('../models/Patient');
const auth = require('../middleware/auth');

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

    const patient = await Patient.findOne({ email: email.toLowerCase() }).select('+password');
    if (!patient || !(await patient.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = signToken(patient._id);

    res.json({
      message: 'Login successful',
      token,
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
