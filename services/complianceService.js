const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const SymptomAssessment = require('../models/SymptomAssessment');
const ConsentRecord = require('../models/ConsentRecord');
const AuditLog = require('../models/AuditLog');
const Consultation = require('../models/Consultation');
const ConsultationMessage = require('../models/ConsultationMessage');
const ClinicalRecord = require('../models/ClinicalRecord');
const DoctorNote = require('../models/DoctorNote');
const PharmacyOrder = require('../models/PharmacyOrder');
const QueueEntry = require('../models/QueueEntry');
const { decrypt } = require('./encryptionService');
const { logFromRequest } = require('./auditService');
const { buildPatientExportPdf } = require('./pdfExportService');

const PRIVACY_NOTICE = {
  version: '1.0',
  effectiveDate: '2026-01-01',
  regulations: [
    'Nigeria Data Protection Regulation (NDPR)',
    'HIPAA-aligned safeguards for protected health information (PHI)',
  ],
  summary: [
    'EZYMED collects and processes health data only for care delivery, triage, appointments, and telemedicine.',
    'Clinical chat messages and notes are encrypted at rest using AES-256-GCM.',
    'All access to patient records is logged in tamper-evident audit logs.',
    'You control consent for data sharing, telemedicine, and optional research use.',
    'You may export your data or revoke non-essential consents at any time.',
  ],
  rights: [
    'Right to access your personal and health data',
    'Right to correct inaccurate information',
    'Right to export a copy of your records',
    'Right to withdraw consent (where clinically appropriate)',
    'Right to request account deletion via support',
  ],
  contact: {
    privacyEmail: 'privacy@ezymed.com',
    dpo: 'EZYMED Data Protection Officer',
  },
};

const OPENAI_PHI_POLICY = {
  summary: 'Patient summaries may use OpenAI only when OPENAI_PHI_ENABLED=true and a valid Business Associate Agreement is in place.',
  requirements: [
    'Set OPENAI_PHI_ENABLED=true only after legal/BAA review',
    'Use a dedicated OpenAI API key with usage restrictions',
    'Doctor notes are decrypted locally before any AI request',
    'Without explicit enablement, summaries use on-platform rules only',
  ],
};

function mapConsultation(c) {
  return {
    id: c._id,
    mode: c.mode,
    status: c.status,
    department: c.department,
    doctorName: c.doctorName,
    reason: c.reason,
    createdAt: c.createdAt,
    startedAt: c.startedAt,
    endedAt: c.endedAt,
  };
}

function mapClinicalRecord(r) {
  return {
    id: r._id,
    type: r.type,
    title: r.title,
    details: r.details,
    doctorName: r.doctorName,
    fileName: r.fileName,
    createdAt: r.createdAt,
  };
}

async function exportPatientData(patientId, req) {
  const patient = await Patient.findById(patientId);
  if (!patient) throw new Error('Patient not found');

  const [
    appointments,
    assessments,
    consents,
    accessLogs,
    consultations,
    clinicalRecords,
    doctorNotes,
    pharmacyOrders,
    queueEntries,
  ] = await Promise.all([
    Appointment.find({ patient: patientId }).sort({ scheduledAt: -1 }),
    SymptomAssessment.find({ patient: patientId }).sort({ createdAt: -1 }),
    ConsentRecord.find({ patient: patientId }),
    AuditLog.find({ patientId }).sort({ createdAt: -1 }).limit(200),
    Consultation.find({ patient: patientId }).sort({ createdAt: -1 }),
    ClinicalRecord.find({ patient: patientId }).sort({ createdAt: -1 }),
    DoctorNote.find({ patient: patientId }).sort({ createdAt: -1 }),
    PharmacyOrder.find({ patient: patientId }).sort({ createdAt: -1 }),
    QueueEntry.find({ patient: patientId }).sort({ createdAt: -1 }).limit(50),
  ]);

  const consultationIds = consultations.map((c) => c._id);
  const consultationMessages = consultationIds.length
    ? await ConsultationMessage.find({ consultation: { $in: consultationIds } }).sort({ createdAt: 1 })
    : [];

  await logFromRequest(req, {
    action: 'data.export',
    resourceType: 'patient',
    resourceId: patientId.toString(),
    patientId,
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    privacyNoticeVersion: PRIVACY_NOTICE.version,
    patient: patient.toPublicJSON(),
    appointments,
    symptomAssessments: assessments,
    consents,
    consultations: consultations.map(mapConsultation),
    consultationMessages: consultationMessages.map((m) => ({
      consultation: m.consultation,
      senderType: m.senderType,
      senderName: m.senderName,
      content: decrypt(m.content),
      createdAt: m.createdAt,
    })),
    clinicalRecords: clinicalRecords.map(mapClinicalRecord),
    doctorNotes: doctorNotes.map((n) => ({
      title: n.title,
      content: decrypt(n.content),
      doctorId: n.doctorId,
      doctorName: n.doctorName,
      createdAt: n.createdAt,
    })),
    pharmacyOrders: pharmacyOrders.map((o) => ({
      medication: o.medication,
      dosage: o.dosage,
      frequency: o.frequency,
      status: o.status,
      pharmacyId: o.pharmacyId,
      notificationMessage: o.notificationMessage,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    })),
    queueHistory: queueEntries.map((q) => ({
      department: q.department,
      status: q.status,
      urgency: q.urgency,
      queueNumber: q.queueNumber,
      createdAt: q.createdAt,
    })),
    accessAuditTrail: accessLogs.map((l) => ({
      action: l.action,
      actorRole: l.actorRole,
      actorName: l.actorName,
      outcome: l.outcome,
      createdAt: l.createdAt,
    })),
  };

  return buildPatientExportPdf(payload);
}

function getPrivacyNotice() {
  return PRIVACY_NOTICE;
}

function getRegulatoryInfo() {
  return {
    platform: 'EZYMED Healthcare Platform',
    complianceFrameworks: PRIVACY_NOTICE.regulations,
    securityControls: [
      'Role-based access control (RBAC)',
      'Multi-factor authentication (TOTP)',
      'AES-256-GCM encryption at rest for clinical messages and notes',
      'TLS required in production (HTTPS)',
      'Comprehensive audit logging',
      'Patient consent management (explicit opt-in at registration)',
    ],
    openAiPhiPolicy: OPENAI_PHI_POLICY,
    dataRetention: 'Records retained per clinical and legal requirements. Contact privacy@ezymed.com for deletion requests.',
  };
}

module.exports = {
  exportPatientData,
  getPrivacyNotice,
  getRegulatoryInfo,
  PRIVACY_NOTICE,
  OPENAI_PHI_POLICY,
};
