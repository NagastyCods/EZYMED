const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const SymptomAssessment = require('../models/SymptomAssessment');
const ConsentRecord = require('../models/ConsentRecord');
const AuditLog = require('../models/AuditLog');
const { decrypt } = require('./encryptionService');
const { logFromRequest } = require('./auditService');

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

async function exportPatientData(patientId, req) {
  const patient = await Patient.findById(patientId);
  if (!patient) throw new Error('Patient not found');

  const [appointments, assessments, consents, accessLogs] = await Promise.all([
    Appointment.find({ patient: patientId }).sort({ scheduledAt: -1 }),
    SymptomAssessment.find({ patient: patientId }).sort({ createdAt: -1 }),
    ConsentRecord.find({ patient: patientId }),
    AuditLog.find({ patientId }).sort({ createdAt: -1 }).limit(200),
  ]);

  await logFromRequest(req, {
    action: 'data.export',
    resourceType: 'patient',
    resourceId: patientId.toString(),
    patientId,
  });

  return {
    exportedAt: new Date().toISOString(),
    privacyNoticeVersion: PRIVACY_NOTICE.version,
    patient: patient.toPublicJSON(),
    appointments,
    symptomAssessments: assessments,
    consents,
    accessAuditTrail: accessLogs.map((l) => ({
      action: l.action,
      actorRole: l.actorRole,
      actorName: l.actorName,
      outcome: l.outcome,
      createdAt: l.createdAt,
    })),
  };
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
      'Patient consent management',
    ],
    dataRetention: 'Records retained per clinical and legal requirements. Contact privacy@ezymed.com for deletion requests.',
  };
}

module.exports = {
  exportPatientData,
  getPrivacyNotice,
  getRegulatoryInfo,
  PRIVACY_NOTICE,
};
