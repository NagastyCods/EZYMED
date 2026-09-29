const express = require('express');
const jwt = require('jsonwebtoken');
const Patient = require('../models/Patient');
const { findDoctorById } = require('../config/doctors');
const { getJwtSecret } = require('../config/secrets');
const {
  assertClinicalFileAccess,
  resolveClinicalFilePath,
} = require('../services/clinicalFileService');
const { logAudit } = require('../services/auditService');

const router = express.Router();

async function resolveClinicalFileActor(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, getJwtSecret());

    if (decoded.role === 'doctor') {
      const doctor = findDoctorById(decoded.id);
      if (!doctor) return null;
      return { role: 'doctor', doctorId: doctor.id, name: doctor.name };
    }

    const patient = await Patient.findById(decoded.id);
    if (patient) {
      return { role: 'patient', patientId: patient._id, name: `${patient.firstName} ${patient.lastName}` };
    }
  } catch {
    return null;
  }

  return null;
}

router.get('/clinical/:recordId', async (req, res) => {
  const actor = await resolveClinicalFileActor(req);
  if (!actor) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const record = await assertClinicalFileAccess(actor, req.params.recordId, req);
    const filePath = resolveClinicalFilePath(record);

    await logAudit({
      actorRole: actor.role,
      actorId: actor.role === 'patient' ? actor.patientId.toString() : actor.doctorId,
      actorName: actor.name,
      action: 'clinical_file.download',
      resourceType: 'clinical_record',
      resourceId: record._id.toString(),
      patientId: record.patient,
      req,
    });

    res.setHeader('Content-Type', record.fileMimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${(record.fileName || record.title || 'clinical-file').replace(/"/g, '')}"`
    );
    res.sendFile(filePath);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Download failed' });
  }
});

module.exports = router;
