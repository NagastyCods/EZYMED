const mongoose = require('mongoose');

const doctorNoteSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
  },
  doctorId: { type: String, required: true },
  doctorName: { type: String, trim: true },
  consultation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Consultation',
    default: null,
  },
  title: { type: String, trim: true, default: 'Clinical note' },
  content: { type: String, required: true, trim: true },
}, { timestamps: true });

doctorNoteSchema.index({ patient: 1, createdAt: -1 });
doctorNoteSchema.index({ doctorId: 1, createdAt: -1 });

module.exports = mongoose.model('DoctorNote', doctorNoteSchema);
