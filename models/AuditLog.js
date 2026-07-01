const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actorRole: {
    type: String,
    enum: ['patient', 'doctor', 'admin', 'pharmacist', 'system'],
    required: true,
  },
  actorId: { type: String, trim: true },
  actorName: { type: String, trim: true },
  action: { type: String, required: true, trim: true },
  resourceType: { type: String, trim: true },
  resourceId: { type: String, trim: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
  outcome: { type: String, enum: ['success', 'failure', 'denied'], default: 'success' },
  ipAddress: { type: String, trim: true },
  userAgent: { type: String, trim: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorRole: 1, actorId: 1, createdAt: -1 });
auditLogSchema.index({ patientId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
