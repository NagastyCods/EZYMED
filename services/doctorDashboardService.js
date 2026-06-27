const Appointment = require('../models/Appointment');
const Consultation = require('../models/Consultation');
const Patient = require('../models/Patient');
const SymptomAssessment = require('../models/SymptomAssessment');
const ClinicalRecord = require('../models/ClinicalRecord');
const DoctorNote = require('../models/DoctorNote');
const { findDoctorById } = require('../config/doctors');

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()) {
  const d = startOfDay(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

async function assertDoctorPatientAccess(doctorId, patientId) {
  const doctor = findDoctorById(doctorId);
  if (!doctor) throw new Error('Doctor not found');

  const [appointment, consultation] = await Promise.all([
    Appointment.findOne({ patient: patientId, doctorId: doctor.id }),
    Consultation.findOne({ patient: patientId, doctorId: doctor.id }),
  ]);

  if (!appointment && !consultation) {
    const deptAppointment = await Appointment.findOne({
      patient: patientId,
      department: doctor.department,
    });
    const deptConsultation = await Consultation.findOne({
      patient: patientId,
      department: doctor.department,
    });
    if (!deptAppointment && !deptConsultation) {
      throw new Error('You do not have access to this patient record');
    }
  }

  return doctor;
}

async function getDoctorDashboardOverview(doctorId) {
  const doctor = findDoctorById(doctorId);
  if (!doctor) throw new Error('Doctor not found');

  const todayStart = startOfDay();
  const todayEnd = endOfDay();

  const [todayAppointments, waitingConsultations, activeConsultations, completedToday] = await Promise.all([
    Appointment.find({
      doctorId: doctor.id,
      scheduledAt: { $gte: todayStart, $lte: todayEnd },
      status: { $ne: 'cancelled' },
    }).populate('patient', 'firstName lastName email'),
    Consultation.countDocuments({
      status: 'waiting',
      $or: [
        { doctorId: doctor.id },
        { doctorId: null },
        { department: doctor.department, doctorId: { $exists: false } },
      ],
    }),
    Consultation.countDocuments({ doctorId: doctor.id, status: 'active' }),
    Appointment.countDocuments({
      doctorId: doctor.id,
      scheduledAt: { $gte: todayStart, $lte: todayEnd },
      status: 'completed',
    }),
  ]);

  const nextAppointment = await Appointment.findOne({
    doctorId: doctor.id,
    status: 'scheduled',
    scheduledAt: { $gte: new Date() },
  })
    .populate('patient', 'firstName lastName')
    .sort({ scheduledAt: 1 });

  return {
    doctor: { id: doctor.id, name: doctor.name, department: doctor.department, title: doctor.title },
    stats: {
      appointmentsToday: todayAppointments.length,
      waitingConsultations,
      activeConsultations,
      completedToday,
    },
    todayAppointments,
    nextAppointment,
  };
}

async function getDoctorAppointments(doctorId, { date, status } = {}) {
  const doctor = findDoctorById(doctorId);
  if (!doctor) throw new Error('Doctor not found');

  const query = { doctorId: doctor.id };

  if (status) query.status = status;

  if (date) {
    query.scheduledAt = { $gte: startOfDay(date), $lte: endOfDay(date) };
  } else {
    const rangeStart = startOfDay();
    rangeStart.setDate(rangeStart.getDate() - 7);
    const rangeEnd = endOfDay();
    rangeEnd.setDate(rangeEnd.getDate() + 14);
    query.scheduledAt = { $gte: rangeStart, $lte: rangeEnd };
  }

  const appointments = await Appointment.find(query)
    .populate('patient', 'firstName lastName email phone dateOfBirth')
    .sort({ scheduledAt: 1 });

  return appointments;
}

async function getPatientHistory(doctorId, patientId) {
  await assertDoctorPatientAccess(doctorId, patientId);

  const patient = await Patient.findById(patientId).select('-password');
  if (!patient) throw new Error('Patient not found');

  const [appointments, assessments, records, notes, consultations] = await Promise.all([
    Appointment.find({ patient: patientId }).sort({ scheduledAt: -1 }).limit(20),
    SymptomAssessment.find({ patient: patientId }).sort({ createdAt: -1 }).limit(10),
    ClinicalRecord.find({ patient: patientId }).sort({ createdAt: -1 }).limit(30),
    DoctorNote.find({ patient: patientId }).sort({ createdAt: -1 }).limit(20),
    Consultation.find({ patient: patientId }).sort({ createdAt: -1 }).limit(10),
  ]);

  return {
    patient: patient.toPublicJSON ? patient.toPublicJSON() : patient,
    appointments,
    assessments,
    records,
    notes,
    consultations,
  };
}

async function addDoctorNote(doctorId, patientId, { content, title, consultationId }) {
  const doctor = await assertDoctorPatientAccess(doctorId, patientId);
  if (!content?.trim()) throw new Error('Note content is required');

  if (consultationId) {
    const consultation = await Consultation.findOne({ _id: consultationId, patient: patientId });
    if (!consultation) throw new Error('Consultation not found');
  }

  return DoctorNote.create({
    patient: patientId,
    doctorId: doctor.id,
    doctorName: doctor.name,
    consultation: consultationId || null,
    title: title?.trim() || 'Clinical note',
    content: content.trim(),
  });
}

async function completeAppointment(doctorId, appointmentId) {
  const doctor = findDoctorById(doctorId);
  const appointment = await Appointment.findOne({ _id: appointmentId, doctorId: doctor.id });
  if (!appointment) throw new Error('Appointment not found');

  appointment.status = 'completed';
  await appointment.save();
  return appointment;
}

module.exports = {
  getDoctorDashboardOverview,
  getDoctorAppointments,
  getPatientHistory,
  addDoctorNote,
  completeAppointment,
  assertDoctorPatientAccess,
};
