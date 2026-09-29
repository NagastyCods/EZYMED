const express = require('express');
const Patient = require('../models/Patient');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/roles');

const router = express.Router();

router.use(auth);

router.get('/profile', requirePermission(PERMISSIONS.PROFILE_READ), async (req, res) => {
  res.json({ patient: req.patient.toPublicJSON() });
});

router.put('/profile', requirePermission(PERMISSIONS.PROFILE_WRITE), async (req, res) => {
  try {
    const allowed = [
      'firstName', 'lastName', 'phone', 'dateOfBirth', 'gender',
      'bloodType', 'address', 'insurance',
    ];

    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        req.patient[field] = req.body[field];
      }
    });

    if (req.body.dateOfBirth) {
      req.patient.dateOfBirth = new Date(req.body.dateOfBirth);
    }

    await req.patient.save();
    res.json({ message: 'Profile updated', patient: req.patient.toPublicJSON() });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Update failed' });
  }
});

router.post('/allergies', requirePermission(PERMISSIONS.PROFILE_WRITE), async (req, res) => {
  try {
    const { allergen, severity, reaction } = req.body;
    if (!allergen) return res.status(400).json({ message: 'Allergen is required' });

    req.patient.allergies.push({ allergen, severity, reaction });
    await req.patient.save();
    res.status(201).json({ message: 'Allergy added', allergies: req.patient.allergies });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/allergies/:id', requirePermission(PERMISSIONS.PROFILE_WRITE), async (req, res) => {
  try {
    const allergy = req.patient.allergies.id(req.params.id);
    if (!allergy) return res.status(404).json({ message: 'Allergy not found' });

    Object.assign(allergy, req.body);
    await req.patient.save();
    res.json({ message: 'Allergy updated', allergies: req.patient.allergies });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/allergies/:id', requirePermission(PERMISSIONS.PROFILE_WRITE), async (req, res) => {
  try {
    const allergy = req.patient.allergies.id(req.params.id);
    if (!allergy) return res.status(404).json({ message: 'Allergy not found' });

    allergy.deleteOne();
    await req.patient.save();
    res.json({ message: 'Allergy removed', allergies: req.patient.allergies });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/medications', requirePermission(PERMISSIONS.PROFILE_WRITE), async (req, res) => {
  try {
    const { name, dosage, frequency, prescribedBy, startDate } = req.body;
    if (!name) return res.status(400).json({ message: 'Medication name is required' });

    req.patient.medications.push({
      name, dosage, frequency, prescribedBy,
      startDate: startDate ? new Date(startDate) : undefined,
    });
    await req.patient.save();
    res.status(201).json({ message: 'Medication added', medications: req.patient.medications });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/medications/:id', requirePermission(PERMISSIONS.PROFILE_WRITE), async (req, res) => {
  try {
    const med = req.patient.medications.id(req.params.id);
    if (!med) return res.status(404).json({ message: 'Medication not found' });

    Object.assign(med, req.body);
    if (req.body.startDate) med.startDate = new Date(req.body.startDate);
    await req.patient.save();
    res.json({ message: 'Medication updated', medications: req.patient.medications });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/medications/:id', requirePermission(PERMISSIONS.PROFILE_WRITE), async (req, res) => {
  try {
    const med = req.patient.medications.id(req.params.id);
    if (!med) return res.status(404).json({ message: 'Medication not found' });

    med.deleteOne();
    await req.patient.save();
    res.json({ message: 'Medication removed', medications: req.patient.medications });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/medical-history', requirePermission(PERMISSIONS.PROFILE_WRITE), async (req, res) => {
  try {
    const { condition, diagnosedDate, status, notes } = req.body;
    if (!condition) return res.status(400).json({ message: 'Condition is required' });

    req.patient.medicalHistory.push({
      condition, status, notes,
      diagnosedDate: diagnosedDate ? new Date(diagnosedDate) : undefined,
    });
    await req.patient.save();
    res.status(201).json({ message: 'Record added', medicalHistory: req.patient.medicalHistory });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/medical-history/:id', requirePermission(PERMISSIONS.PROFILE_WRITE), async (req, res) => {
  try {
    const record = req.patient.medicalHistory.id(req.params.id);
    if (!record) return res.status(404).json({ message: 'Record not found' });

    Object.assign(record, req.body);
    if (req.body.diagnosedDate) record.diagnosedDate = new Date(req.body.diagnosedDate);
    await req.patient.save();
    res.json({ message: 'Record updated', medicalHistory: req.patient.medicalHistory });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/medical-history/:id', requirePermission(PERMISSIONS.PROFILE_WRITE), async (req, res) => {
  try {
    const record = req.patient.medicalHistory.id(req.params.id);
    if (!record) return res.status(404).json({ message: 'Record not found' });

    record.deleteOne();
    await req.patient.save();
    res.json({ message: 'Record removed', medicalHistory: req.patient.medicalHistory });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/emergency-contacts', requirePermission(PERMISSIONS.PROFILE_WRITE), async (req, res) => {
  try {
    const { name, relationship, phone, email } = req.body;
    if (!name || !relationship || !phone) {
      return res.status(400).json({ message: 'Name, relationship, and phone are required' });
    }

    req.patient.emergencyContacts.push({ name, relationship, phone, email });
    await req.patient.save();
    res.status(201).json({ message: 'Contact added', emergencyContacts: req.patient.emergencyContacts });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/emergency-contacts/:id', requirePermission(PERMISSIONS.PROFILE_WRITE), async (req, res) => {
  try {
    const contact = req.patient.emergencyContacts.id(req.params.id);
    if (!contact) return res.status(404).json({ message: 'Contact not found' });

    Object.assign(contact, req.body);
    await req.patient.save();
    res.json({ message: 'Contact updated', emergencyContacts: req.patient.emergencyContacts });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/emergency-contacts/:id', requirePermission(PERMISSIONS.PROFILE_WRITE), async (req, res) => {
  try {
    const contact = req.patient.emergencyContacts.id(req.params.id);
    if (!contact) return res.status(404).json({ message: 'Contact not found' });

    contact.deleteOne();
    await req.patient.save();
    res.json({ message: 'Contact removed', emergencyContacts: req.patient.emergencyContacts });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/insurance', requirePermission(PERMISSIONS.PROFILE_WRITE), async (req, res) => {
  try {
    req.patient.insurance = { ...req.patient.insurance?.toObject?.() || req.patient.insurance || {}, ...req.body };
    if (req.body.expiryDate) {
      req.patient.insurance.expiryDate = new Date(req.body.expiryDate);
    }
    await req.patient.save();
    res.json({ message: 'Insurance updated', insurance: req.patient.insurance });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/pharmacy-orders', requirePermission(PERMISSIONS.PROFILE_READ), async (req, res) => {
  try {
    const { getPatientPharmacyOrders } = require('../services/pharmacyService');
    const orders = await getPatientPharmacyOrders(req.patientId);
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
