const Consultation = require('../models/Consultation');
const ConsultationMessage = require('../models/ConsultationMessage');
const ClinicalRecord = require('../models/ClinicalRecord');
const { findDoctorById, DOCTORS } = require('../config/doctors');
const { receivePrescription } = require('./pharmacyService');
const { encrypt, decrypt } = require('./encryptionService');
const { requireActiveConsent } = require('./consentService');
const { logAudit } = require('./auditService');

async function getActiveConsultation(patientId) {
  return Consultation.findOne({
    patient: patientId,
    status: { $in: ['waiting', 'active'] },
  }).sort({ createdAt: -1 });
}

function decryptMessage(message) {
  const obj = message.toObject ? message.toObject() : { ...message };
  obj.content = decrypt(obj.content);
  return obj;
}

async function requestConsultation(patientId, { mode, doctorId, department, reason, appointmentId }, req) {
  await requireActiveConsent(patientId, 'telemedicine');

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
    content: encrypt(`Consultation requested (${mode}). Waiting for ${doctor?.name || 'a doctor'} to join.`),
  });

  await logAudit({
    actorRole: 'patient',
    actorId: patientId.toString(),
    action: 'consultation.request',
    resourceType: 'consultation',
    resourceId: consultation._id.toString(),
    patientId,
    req,
    metadata: { mode },
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

async function endConsultation(patientId, consultationId, req) {
  const consultation = await getConsultationForPatient(patientId, consultationId);
  if (consultation.status === 'ended') return consultation;

  consultation.status = 'ended';
  consultation.endedAt = new Date();
  await consultation.save();

  await ConsultationMessage.create({
    consultation: consultation._id,
    senderType: 'patient',
    senderName: 'System',
    content: encrypt('Consultation ended.'),
  });

  await logAudit({
    actorRole: 'patient',
    actorId: patientId.toString(),
    action: 'consultation.end',
    resourceType: 'consultation',
    resourceId: consultation._id.toString(),
    patientId,
    req,
  });

  return consultation;
}

async function getMessages(consultationId) {
  const messages = await ConsultationMessage.find({ consultation: consultationId }).sort({ createdAt: 1 });
  return messages.map(decryptMessage);
}

async function getClinicalRecords(consultationId) {
  return ClinicalRecord.find({ consultation: consultationId }).sort({ createdAt: -1 });
}

async function getPatientRecords(patientId) {
  return ClinicalRecord.find({ patient: patientId }).sort({ createdAt: -1 }).limit(50);
}

async function doctorJoinConsultation(doctorId, consultationId, req) {
  const doctor = findDoctorById(doctorId);
  if (!doctor) throw new Error('Doctor not found.');

  const consultation = await Consultation.findById(consultationId);
  if (!consultation) throw new Error('Consultation not found.');
  if (consultation.status === 'ended') throw new Error('Consultation has already ended.');

  await requireActiveConsent(consultation.patient, 'telemedicine');

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
    content: encrypt(`${doctor.name} joined the consultation.`),
  });

  await logAudit({
    actorRole: 'doctor',
    actorId: doctor.id,
    actorName: doctor.name,
    action: 'consultation.join',
    resourceType: 'consultation',
    resourceId: consultation._id.toString(),
    patientId: consultation.patient,
    req,
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

async function addClinicalRecord(doctorId, consultationId, payload, req) {
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
    content: encrypt(`${typeLabels[payload.type] || 'Record added'}: ${payload.title}`),
  });

  await logAudit({
    actorRole: 'doctor',
    actorId: doctor.id,
    actorName: doctor.name,
    action: `clinical.${payload.type}`,
    resourceType: 'clinical_record',
    resourceId: record._id.toString(),
    patientId: consultation.patient,
    req,
    metadata: { title: payload.title },
  });

  if (payload.type === 'prescription') {
    await receivePrescription(record);
  }

  return record;
}

async function saveChatMessage(consultationId, senderType, senderName, content) {
  return ConsultationMessage.create({
    consultation: consultationId,
    senderType,
    senderName,
    content: encrypt(content),
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
