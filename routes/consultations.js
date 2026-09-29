const express = require('express');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/roles');
const {
  requestConsultation,
  getActiveConsultation,
  getConsultationForPatient,
  endConsultation,
  getMessages,
  getClinicalRecords,
  getPatientRecords,
} = require('../services/telemedicineService');

const router = express.Router();

router.use(auth);

router.get('/active', requirePermission(PERMISSIONS.CONSULTATIONS_REQUEST), async (req, res) => {
  try {
    const consultation = await getActiveConsultation(req.patientId);
    res.json({ consultation, hasActive: Boolean(consultation) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/request', requirePermission(PERMISSIONS.CONSULTATIONS_REQUEST), async (req, res) => {
  try {
    const { mode, doctorId, department, reason, appointmentId } = req.body;
    if (!mode || !['video', 'voice', 'chat'].includes(mode)) {
      return res.status(400).json({ message: 'Select a consultation mode: video, voice, or chat.' });
    }

    const consultation = await requestConsultation(req.patientId, {
      mode, doctorId, department, reason, appointmentId,
    }, req);

    res.status(201).json({ message: 'Consultation requested', consultation });
  } catch (err) {
    const status = err.code === 'CONSENT_REQUIRED' ? 403 : 400;
    res.status(status).json({ message: err.message, code: err.code });
  }
});

router.get('/records', requirePermission(PERMISSIONS.CONSULTATIONS_REQUEST), async (req, res) => {
  try {
    const records = await getPatientRecords(req.patientId);
    res.json({ records });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', requirePermission(PERMISSIONS.CONSULTATIONS_REQUEST), async (req, res) => {
  try {
    const consultation = await getConsultationForPatient(req.patientId, req.params.id);
    const [messages, records] = await Promise.all([
      getMessages(consultation._id),
      getClinicalRecords(consultation._id),
    ]);
    res.json({ consultation, messages, records });
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
});

router.get('/:id/messages', requirePermission(PERMISSIONS.CONSULTATIONS_REQUEST), async (req, res) => {
  try {
    await getConsultationForPatient(req.patientId, req.params.id);
    const messages = await getMessages(req.params.id);
    res.json({ messages });
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
});

router.patch('/:id/end', requirePermission(PERMISSIONS.CONSULTATIONS_REQUEST), async (req, res) => {
  try {
    const consultation = await endConsultation(req.patientId, req.params.id, req);
    res.json({ message: 'Consultation ended', consultation });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
