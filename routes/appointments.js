const express = require('express');
const Appointment = require('../models/Appointment');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/roles');
const {
  DEPARTMENTS,
  listDoctors,
  getAvailability,
  bookAppointment,
  rescheduleAppointment,
  cancelAppointment,
  getPatientReminders,
} = require('../services/appointmentService');

const router = express.Router();

router.use(auth);
router.use(requirePermission(PERMISSIONS.APPOINTMENTS_MANAGE));

router.get('/departments', (_req, res) => {
  res.json({ departments: DEPARTMENTS });
});

router.get('/doctors', (req, res) => {
  const { department } = req.query;
  res.json({ doctors: listDoctors(department) });
});

router.get('/availability', async (req, res) => {
  try {
    const { doctorId, doctorName, department, date } = req.query;
    const result = await getAvailability({ doctorId, doctorName, department, date });
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/reminders', async (req, res) => {
  try {
    const reminders = await getPatientReminders(req.patientId);
    res.json({ reminders });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const appointments = await Appointment.find({ patient: req.patientId })
      .sort({ scheduledAt: -1 });
    res.json({ appointments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const appointment = await bookAppointment(req.patientId, req.body);
    res.status(201).json({ message: 'Appointment booked successfully', appointment });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/:id/reschedule', async (req, res) => {
  try {
    const appointment = await rescheduleAppointment(req.patientId, req.params.id, req.body);
    res.json({ message: 'Appointment rescheduled', appointment });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/:id/cancel', async (req, res) => {
  try {
    const appointment = await cancelAppointment(req.patientId, req.params.id);
    res.json({ message: 'Appointment cancelled', appointment });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
