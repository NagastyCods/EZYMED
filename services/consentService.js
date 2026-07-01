const ConsentRecord = require('../models/ConsentRecord');
const { CONSENT_TYPES } = require('../models/ConsentRecord');
const { logAudit } = require('./auditService');

const CONSENT_LABELS = {
  treatment: 'Treatment and care',
  data_sharing: 'Share records with assigned clinicians',
  telemedicine: 'Telemedicine (video, voice, chat)',
  research: 'Anonymized data for quality improvement',
};

async function seedDefaultConsents(patientId, req) {
  const defaults = ['treatment', 'telemedicine', 'data_sharing'];
  const now = new Date();

  for (const consentType of defaults) {
    await ConsentRecord.findOneAndUpdate(
      { patient: patientId, consentType },
      {
        patient: patientId,
        consentType,
        granted: true,
        version: '1.0',
        grantedAt: now,
        revokedAt: null,
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
        notes: 'Default consent at registration',
      },
      { upsert: true, new: true }
    );
  }
}

async function getPatientConsents(patientId) {
  const records = await ConsentRecord.find({ patient: patientId });
  return CONSENT_TYPES.map((type) => {
    const record = records.find((r) => r.consentType === type);
    return {
      consentType: type,
      label: CONSENT_LABELS[type],
      granted: record?.granted ?? false,
      version: record?.version || '1.0',
      grantedAt: record?.grantedAt,
      revokedAt: record?.revokedAt,
      updatedAt: record?.updatedAt,
    };
  });
}

async function grantConsent(patientId, consentType, req) {
  if (!CONSENT_TYPES.includes(consentType)) {
    throw new Error('Invalid consent type');
  }

  const record = await ConsentRecord.findOneAndUpdate(
    { patient: patientId, consentType },
    {
      patient: patientId,
      consentType,
      granted: true,
      version: '1.0',
      grantedAt: new Date(),
      revokedAt: null,
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
    },
    { upsert: true, new: true }
  );

  await logAudit({
    actorRole: 'patient',
    actorId: patientId.toString(),
    action: 'consent.grant',
    resourceType: 'consent',
    resourceId: consentType,
    patientId,
    req,
    metadata: { consentType },
  });

  return record;
}

async function revokeConsent(patientId, consentType, req) {
  if (!CONSENT_TYPES.includes(consentType)) {
    throw new Error('Invalid consent type');
  }
  if (consentType === 'treatment') {
    throw new Error('Treatment consent cannot be revoked while using EZYMED. Contact support to close your account.');
  }

  const record = await ConsentRecord.findOneAndUpdate(
    { patient: patientId, consentType },
    {
      granted: false,
      revokedAt: new Date(),
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
    },
    { new: true }
  );

  if (!record) throw new Error('Consent record not found');

  await logAudit({
    actorRole: 'patient',
    actorId: patientId.toString(),
    action: 'consent.revoke',
    resourceType: 'consent',
    resourceId: consentType,
    patientId,
    req,
    metadata: { consentType },
  });

  return record;
}

async function requireActiveConsent(patientId, consentType) {
  const record = await ConsentRecord.findOne({ patient: patientId, consentType });
  if (!record?.granted) {
    const err = new Error(`Patient has not granted consent for: ${CONSENT_LABELS[consentType] || consentType}`);
    err.code = 'CONSENT_REQUIRED';
    throw err;
  }
}

async function seedExistingPatientConsents() {
  const Patient = require('../models/Patient');
  const patients = await Patient.find({}).select('_id');
  for (const patient of patients) {
    const existing = await ConsentRecord.countDocuments({ patient: patient._id });
    if (existing === 0) {
      await seedDefaultConsents(patient._id);
    }
  }
}

module.exports = {
  CONSENT_TYPES,
  CONSENT_LABELS,
  seedDefaultConsents,
  seedExistingPatientConsents,
  getPatientConsents,
  grantConsent,
  revokeConsent,
  requireActiveConsent,
};
