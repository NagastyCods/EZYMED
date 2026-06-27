const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const consultationSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true, default: () => uuidv4() },
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
  },
  doctorId: { type: String, trim: true },
  doctorName: { type: String, trim: true },
  mode: {
    type: String,
    enum: ['video', 'voice', 'chat'],
    required: true,
  },
  status: {
    type: String,
    enum: ['waiting', 'active', 'ended'],
    default: 'waiting',
  },
  department: { type: String, trim: true },
  reason: { type: String, trim: true },
  appointment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    default: null,
  },
  startedAt: { type: Date },
  endedAt: { type: Date },
}, { timestamps: true });

consultationSchema.index({ patient: 1, status: 1 });
consultationSchema.index({ doctorId: 1, status: 1 });

module.exports = mongoose.model('Consultation', consultationSchema);
