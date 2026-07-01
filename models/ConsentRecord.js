const mongoose = require('mongoose');

const CONSENT_TYPES = ['treatment', 'data_sharing', 'telemedicine', 'research'];

const consentRecordSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
  },
  consentType: {
    type: String,
    enum: CONSENT_TYPES,
    required: true,
  },
  granted: { type: Boolean, default: false },
  version: { type: String, default: '1.0' },
  grantedAt: { type: Date },
  revokedAt: { type: Date },
  ipAddress: { type: String, trim: true },
  userAgent: { type: String, trim: true },
  notes: { type: String, trim: true },
}, { timestamps: true });

consentRecordSchema.index({ patient: 1, consentType: 1 }, { unique: true });

module.exports = mongoose.model('ConsentRecord', consentRecordSchema);
module.exports.CONSENT_TYPES = CONSENT_TYPES;
