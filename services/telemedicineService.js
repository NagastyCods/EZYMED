const Consultation = require('../models/Consultation');
const ConsultationMessage = require('../models/ConsultationMessage');
const ClinicalRecord = require('../models/ClinicalRecord');
const { findDoctorById, DOCTORS } = require('../config/doctors');

async function getActiveConsultation(patientId) {
  return Consultation.findOne({
    patient: patientId,
    status: { $in: ['waiting', 'active'] },
  }).sort({ createdAt: -1 });
}

async function requestConsultation(patientId, { mode, doctorId, department, reason, appointmentId }) {
  const existing = await getActiveConsultation(patientId);
  if (existing) {
    throw new Error('You already have an active consultation. Please end it before starting a new one.');
  }

  let doctor = doctorId ? findDoctorById(doctorId) : null;
  if (!doctor && department) {
    const deptDoctors = DOCTORS.filter((d) => d.department === department);
    doctor = deptDoctors[0] || null;
  }
  if (!doctor) {
    doctor = DOCTORS.find((d) => d.department === 'General Medicine');
  }

  const consultation = await Consultation.create({
    patient: patientId,
    doctorId: doctor?.id,
    doctorName: doctor?.name,
    department: department || doctor?.department || 'General Medicine',
    mode,
    reason,
    appointment: appointmentId || null,
    status: 'waiting',
  });

  await ConsultationMessage.create({
    consultation: consultation._id,
    senderType: 'patient',
    senderName: 'System',
    content: `Consultation requested (${mode}). Waiting for ${doctor?.name || 'a doctor'} to join.`,
  });

  return consultation;
}

async function getConsultationForPatient(patientId, consultationId) {
  const consultation = await Consultation.findOne({
    _id: consultationId,
    patient: patientId,
  });
  if (!consultation) throw new Error('Consultation not found.');
  return consultation;
}

async function endConsultation(patientId, consultationId) {
  const consultation = await getConsultationForPatient(patientId, consultationId);
  if (consultation.status === 'ended') return consultation;

  consultation.status = 'ended';
  consultation.endedAt = new Date();
  await consultation.save();

  await ConsultationMessage.create({
    consultation: consultation._id,
    senderType: 'patient',
    senderName: 'System',
    content: 'Consultation ended.',
  });

  return consultation;
}

async function getMessages(consultationId) {
  return ConsultationMessage.find({ consultation: consultationId }).sort({ createdAt: 1 });
}

async function getClinicalRecords(consultationId) {
  return ClinicalRecord.find({ consultation: consultationId }).sort({ createdAt: -1 });
}

async function getPatientRecords(patientId) {
  return ClinicalRecord.find({ patient: patientId }).sort({ createdAt: -1 }).limit(50);
}

async function doctorJoinConsultation(doctorId, consultationId) {
  const doctor = findDoctorById(doctorId);
  if (!doctor) throw new Error('Doctor not found.');

  const consultation = await Consultation.findById(consultationId);
  if (!consultation) throw new Error('Consultation not found.');
  if (consultation.status === 'ended') throw new Error('Consultation has already ended.');

  consultation.doctorId = doctor.id;
  consultation.doctorName = doctor.name;
  consultation.department = consultation.department || doctor.department;
  consultation.status = 'active';
  consultation.startedAt = consultation.startedAt || new Date();
  await consultation.save();

  await ConsultationMessage.create({
    consultation: consultation._id,
    senderType: 'doctor',
    senderName: doctor.name,
    content: `${doctor.name} joined the consultation.`,
  });

  return consultation;
}

async function getWaitingConsultations(doctorId) {
  const doctor = findDoctorById(doctorId);
  const filter = {
    status: { $in: ['waiting', 'active'] },
  };

  if (doctor) {
    filter.$or = [
      { doctorId: doctor.id },
      { doctorId: { $exists: false } },
      { doctorId: null },
      { department: doctor.department, status: 'waiting' },
    ];
  }

  return Consultation.find(filter)
    .populate('patient', 'firstName lastName email')
    .sort({ createdAt: 1 });
}

async function addClinicalRecord(doctorId, consultationId, payload) {
  const doctor = findDoctorById(doctorId);
  if (!doctor) throw new Error('Doctor not found.');

  const consultation = await Consultation.findById(consultationId);
  if (!consultation) throw new Error('Consultation not found.');

  const record = await ClinicalRecord.create({
    consultation: consultation._id,
    patient: consultation.patient,
    doctorId: doctor.id,
    doctorName: doctor.name,
    ...payload,
  });

  const typeLabels = {
    prescription: 'Prescription sent',
    test: 'Test recommended',
    referral: 'Referral issued',
    file: 'File shared',
  };

  await ConsultationMessage.create({
    consultation: consultation._id,
    senderType: 'doctor',
    senderName: doctor.name,
    content: `${typeLabels[payload.type] || 'Record added'}: ${payload.title}`,
  });

  return record;
}

async function saveChatMessage(consultationId, senderType, senderName, content) {
  return ConsultationMessage.create({
    consultation: consultationId,
    senderType,
    senderName,
    content,
  });
}

module.exports = {
  requestConsultation,
  getActiveConsultation,
  getConsultationForPatient,
  endConsultation,
  getMessages,
  getClinicalRecords,
  getPatientRecords,
  doctorJoinConsultation,
  getWaitingConsultations,
  addClinicalRecord,
  saveChatMessage,
};
