const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  authenticateDoctor,
  doctorAuth,
  DOCTORS,
} = require('../middleware/doctorAuth');
const {
  doctorJoinConsultation,
  getWaitingConsultations,
  addClinicalRecord,
  getMessages,
  getClinicalRecords,
  assertDoctorCanAccessConsultation,
} = require('../services/telemedicineService');
const {
  getDoctorDashboardOverview,
  getDoctorAppointments,
  getPatientHistory,
  addDoctorNote,
  completeAppointment,
} = require('../services/doctorDashboardService');
const { generatePatientSummary } = require('../services/patientSummaryService');
const { authRateLimit } = require('../middleware/rateLimit');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/roles');
const Consultation = require('../models/Consultation');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads', 'consultations');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|png|jpe?g|doc|docx|txt)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error('Allowed file types: PDF, PNG, JPG, DOC, DOCX, TXT'));
  },
});

router.get('/list', (_req, res) => {
  res.json({
    doctors: DOCTORS.map(({ id, name, department, title }) => ({ id, name, department, title })),
  });
});

router.post('/auth/login', authRateLimit, async (req, res) => {
  try {
    const { doctorId, password } = req.body;
    if (!doctorId || !password) {
      return res.status(400).json({ message: 'Doctor ID and password are required' });
    }

    const result = await authenticateDoctor(doctorId, password, req);
    if (result.requiresMfa) {
      return res.json({
        message: 'MFA verification required',
        requiresMfa: true,
        mfaToken: result.mfaToken,
        doctor: result.doctor,
      });
    }

    const { doctor, token } = result;
    res.json({
      message: 'Login successful',
      token,
      doctor: { id: doctor.id, name: doctor.name, department: doctor.department, title: doctor.title },
    });
  } catch (err) {
    res.status(401).json({ message: err.message });
  }
});

router.use(doctorAuth);

router.get('/dashboard', requirePermission(PERMISSIONS.CONSULTATIONS_CONDUCT), async (req, res) => {
  try {
    const data = await getDoctorDashboardOverview(req.doctorId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/appointments', requirePermission(PERMISSIONS.CONSULTATIONS_CONDUCT), async (req, res) => {
  try {
    const appointments = await getDoctorAppointments(req.doctorId, {
      date: req.query.date,
      status: req.query.status,
    });
    res.json({ appointments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/appointments/:id/complete', requirePermission(PERMISSIONS.CONSULTATIONS_CONDUCT), async (req, res) => {
  try {
    const appointment = await completeAppointment(req.doctorId, req.params.id);
    res.json({ message: 'Appointment marked complete', appointment });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/patients/:patientId/history', requirePermission(PERMISSIONS.PATIENT_RECORDS_READ), async (req, res) => {
  try {
    const history = await getPatientHistory(req.doctorId, req.params.patientId, req);
    res.json(history);
  } catch (err) {
    const status = err.code === 'CONSENT_REQUIRED' || err.message.includes('consent') ? 403 : 404;
    res.status(status).json({ message: err.message, code: err.code });
  }
});

router.get('/patients/:patientId/summary', requirePermission(PERMISSIONS.PATIENT_RECORDS_READ), async (req, res) => {
  try {
    await getPatientHistory(req.doctorId, req.params.patientId, req);
    const summary = await generatePatientSummary(req.params.patientId);
    res.json({ summary });
  } catch (err) {
    const status = err.code === 'CONSENT_REQUIRED' || err.message.includes('consent') || err.message.includes('access') ? 403 : 404;
    res.status(status).json({ message: err.message, code: err.code });
  }
});

router.post('/patients/:patientId/notes', requirePermission(PERMISSIONS.PATIENT_RECORDS_WRITE), async (req, res) => {
  try {
    const { content, title, consultationId } = req.body;
    const note = await addDoctorNote(req.doctorId, req.params.patientId, {
      content,
      title,
      consultationId,
    }, req);
    res.status(201).json({ message: 'Note saved', note });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/consultations', requirePermission(PERMISSIONS.CONSULTATIONS_CONDUCT), async (req, res) => {
  try {
    const consultations = await getWaitingConsultations(req.doctorId);
    res.json({ consultations });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/consultations/:id/join', requirePermission(PERMISSIONS.CONSULTATIONS_CONDUCT), async (req, res) => {
  try {
    const consultation = await doctorJoinConsultation(req.doctorId, req.params.id, req);
    const populated = await Consultation.findById(consultation._id)
      .populate('patient', 'firstName lastName email');
    const [messages, records] = await Promise.all([
      getMessages(consultation._id),
      getClinicalRecords(consultation._id),
    ]);
    res.json({
      message: 'Joined consultation',
      consultation: populated,
      messages,
      records,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/consultations/:id', requirePermission(PERMISSIONS.CONSULTATIONS_CONDUCT), async (req, res) => {
  try {
    const { consultation } = await assertDoctorCanAccessConsultation(req.doctorId, req.params.id);
    const populated = await Consultation.findById(consultation._id)
      .populate('patient', 'firstName lastName email');

    const [messages, records] = await Promise.all([
      getMessages(consultation._id),
      getClinicalRecords(consultation._id),
    ]);
    res.json({ consultation: populated, messages, records });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/consultations/:id/prescription', requirePermission(PERMISSIONS.PRESCRIPTIONS_ISSUE), async (req, res) => {
  try {
    const { medication, dosage, frequency, duration, instructions } = req.body;
    if (!medication) return res.status(400).json({ message: 'Medication name is required' });

    const record = await addClinicalRecord(req.doctorId, req.params.id, {
      type: 'prescription',
      title: medication,
      details: { dosage, frequency, duration, instructions },
    }, req);
    res.status(201).json({ message: 'Prescription sent', record });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/consultations/:id/test', requirePermission(PERMISSIONS.PATIENT_RECORDS_WRITE), async (req, res) => {
  try {
    const { testName, urgency, instructions } = req.body;
    if (!testName) return res.status(400).json({ message: 'Test name is required' });

    const record = await addClinicalRecord(req.doctorId, req.params.id, {
      type: 'test',
      title: testName,
      details: { urgency: urgency || 'routine', instructions },
    }, req);
    res.status(201).json({ message: 'Test recommended', record });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/consultations/:id/referral', requirePermission(PERMISSIONS.PATIENT_RECORDS_WRITE), async (req, res) => {
  try {
    const { specialty, facility, reason, urgency } = req.body;
    if (!specialty) return res.status(400).json({ message: 'Specialty is required' });

    const record = await addClinicalRecord(req.doctorId, req.params.id, {
      type: 'referral',
      title: `Referral to ${specialty}`,
      details: { specialty, facility, reason, urgency: urgency || 'routine' },
    }, req);
    res.status(201).json({ message: 'Referral issued', record });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/consultations/:id/note', requirePermission(PERMISSIONS.PATIENT_RECORDS_WRITE), async (req, res) => {
  try {
    const { consultation } = await assertDoctorCanAccessConsultation(req.doctorId, req.params.id, { write: true });

    const note = await addDoctorNote(req.doctorId, consultation.patient, {
      content: req.body.content,
      title: req.body.title,
      consultationId: consultation._id,
    }, req);
    res.status(201).json({ message: 'Note saved', note });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/consultations/:id/file', requirePermission(PERMISSIONS.PATIENT_RECORDS_WRITE), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File is required' });

    const record = await addClinicalRecord(req.doctorId, req.params.id, {
      type: 'file',
      title: req.body.title || req.file.originalname,
      details: { description: req.body.description || '' },
      fileName: req.file.originalname,
      filePath: req.file.filename,
      fileMimeType: req.file.mimetype,
    }, req);
    res.status(201).json({ message: 'File shared', record });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/consultations/:id/end', requirePermission(PERMISSIONS.CONSULTATIONS_CONDUCT), async (req, res) => {
  try {
    const { consultation } = await assertDoctorCanAccessConsultation(req.doctorId, req.params.id, { write: true });
    if (consultation.status === 'ended') {
      return res.json({ message: 'Consultation already ended', consultation });
    }

    consultation.status = 'ended';
    consultation.endedAt = new Date();
    await consultation.save();
    res.json({ message: 'Consultation ended', consultation });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
