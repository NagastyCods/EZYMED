const mongoose = require('mongoose');

const statusHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  note: { type: String, trim: true },
  byPharmacyId: { type: String, trim: true },
  at: { type: Date, default: Date.now },
}, { _id: false });

const pharmacyOrderSchema = new mongoose.Schema({
  prescription: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClinicalRecord',
    required: true,
    unique: true,
  },
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
  },
  pharmacyId: { type: String, trim: true },
  medication: { type: String, required: true, trim: true },
  dosage: { type: String, trim: true },
  frequency: { type: String, trim: true },
  duration: { type: String, trim: true },
  instructions: { type: String, trim: true },
  doctorId: { type: String, trim: true },
  doctorName: { type: String, trim: true },
  status: {
    type: String,
    enum: [
      'received',
      'verified',
      'preparing',
      'ready',
      'out_for_delivery',
      'completed',
      'cancelled',
    ],
    default: 'received',
  },
  verificationNotes: { type: String, trim: true },
  deliveryMethod: {
    type: String,
    enum: ['pickup', 'delivery', ''],
    default: '',
  },
  deliveryAddress: { type: String, trim: true },
  deliveryScheduledAt: { type: Date },
  deliveryNotes: { type: String, trim: true },
  patientNotifiedAt: { type: Date },
  notificationMessage: { type: String, trim: true },
  statusHistory: [statusHistorySchema],
}, { timestamps: true });

pharmacyOrderSchema.index({ pharmacyId: 1, status: 1, createdAt: -1 });
pharmacyOrderSchema.index({ patient: 1, createdAt: -1 });
pharmacyOrderSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('PharmacyOrder', pharmacyOrderSchema);
