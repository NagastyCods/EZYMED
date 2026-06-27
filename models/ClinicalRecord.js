const mongoose = require('mongoose');

const clinicalRecordSchema = new mongoose.Schema({
  consultation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Consultation',
    required: true,
  },
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
  },
  doctorId: { type: String, required: true },
  doctorName: { type: String, trim: true },
  type: {
    type: String,
    enum: ['prescription', 'test', 'referral', 'file'],
    required: true,
  },
  title: { type: String, required: true, trim: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  fileName: { type: String, trim: true },
  filePath: { type: String, trim: true },
  fileMimeType: { type: String, trim: true },
}, { timestamps: true });

clinicalRecordSchema.index({ consultation: 1 });
clinicalRecordSchema.index({ patient: 1, createdAt: -1 });

module.exports = mongoose.model('ClinicalRecord', clinicalRecordSchema);
