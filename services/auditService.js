const AuditLog = require('../models/AuditLog');

async function logAudit({
  actorRole,
  actorId,
  actorName,
  action,
  resourceType,
  resourceId,
  patientId,
  outcome = 'success',
  req,
  metadata = {},
}) {
  try {
    await AuditLog.create({
      actorRole,
      actorId: actorId?.toString(),
      actorName,
      action,
      resourceType,
      resourceId: resourceId?.toString(),
      patientId,
      outcome,
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim(),
      userAgent: req?.headers?.['user-agent'],
      metadata,
    });
  } catch {
    /* audit failures must not break primary flows */
  }
}

function auditFromRequest(req) {
  if (req.patient) {
    return {
      actorRole: 'patient',
      actorId: req.patientId?.toString(),
      actorName: `${req.patient.firstName} ${req.patient.lastName}`.trim(),
    };
  }
  if (req.doctor) {
    return {
      actorRole: 'doctor',
      actorId: req.doctorId,
      actorName: req.doctor.name,
    };
  }
  if (req.admin) {
    return {
      actorRole: 'admin',
      actorId: req.admin.id,
      actorName: req.admin.name || req.admin.email,
    };
  }
  return { actorRole: 'system', actorId: 'system', actorName: 'System' };
}

async function logFromRequest(req, payload) {
  const actor = auditFromRequest(req);
  return logAudit({ ...actor, req, ...payload });
}

async function getAuditLogs({ limit = 100, action, actorRole, patientId, from, to } = {}) {
  const query = {};
  if (action) query.action = action;
  if (actorRole) query.actorRole = actorRole;
  if (patientId) query.patientId = patientId;
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = new Date(to);
  }

  const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(limit);
  return logs;
}

module.exports = {
  logAudit,
  logFromRequest,
  auditFromRequest,
  getAuditLogs,
};
