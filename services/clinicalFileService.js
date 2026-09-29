const path = require('path');
const fs = require('fs');
const ClinicalRecord = require('../models/ClinicalRecord');
const Consultation = require('../models/Consultation');
const { logAudit } = require('./auditService');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'consultations');

async function assertClinicalFileAccess(actor, recordId, req) {
  const record = await ClinicalRecord.findById(recordId);
  if (!record || record.type !== 'file' || !record.filePath) {
    const err = new Error('File not found');
    err.status = 404;
    throw err;
  }

  if (actor.role === 'patient') {
    if (record.patient.toString() !== actor.patientId.toString()) {
      await logDenied(actor, record, req);
      const err = new Error('Access denied');
      err.status = 403;
      throw err;
    }
    return record;
  }

  if (actor.role === 'doctor') {
    const consultation = await Consultation.findById(record.consultation);
    if (!consultation) {
      const err = new Error('File not found');
      err.status = 404;
      throw err;
    }

    const allowed =
      record.doctorId === actor.doctorId ||
      consultation.doctorId === actor.doctorId;

    if (!allowed) {
      await logDenied(actor, record, req);
      const err = new Error('Access denied');
      err.status = 403;
      throw err;
    }

    return record;
  }

  const err = new Error('Access denied');
  err.status = 403;
  throw err;
}

async function logDenied(actor, record, req) {
  await logAudit({
    actorRole: actor.role,
    actorId: actor.role === 'patient' ? actor.patientId.toString() : actor.doctorId,
    action: 'clinical_file.access_denied',
    outcome: 'denied',
    resourceType: 'clinical_record',
    resourceId: record._id.toString(),
    patientId: record.patient,
    req,
  });
}

function resolveClinicalFilePath(record) {
  const filename = path.basename(record.filePath);
  const absolutePath = path.join(UPLOAD_DIR, filename);
  const resolvedDir = path.resolve(UPLOAD_DIR);
  const resolvedFile = path.resolve(absolutePath);

  if (!resolvedFile.startsWith(resolvedDir + path.sep) && resolvedFile !== resolvedDir) {
    const err = new Error('Invalid file path');
    err.status = 400;
    throw err;
  }

  if (!fs.existsSync(resolvedFile)) {
    const err = new Error('File not found on server');
    err.status = 404;
    throw err;
  }

  return resolvedFile;
}

module.exports = {
  assertClinicalFileAccess,
  resolveClinicalFilePath,
  UPLOAD_DIR,
};
