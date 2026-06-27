const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
  },
  doctorId: { type: String, trim: true },
  type: {
    type: String,
    enum: ['virtual', 'in-person', 'follow-up'],
    default: 'virtual',
  },
  department: { type: String, trim: true, default: 'General Medicine' },
  doctorName: { type: String, trim: true, required: true },
  scheduledAt: { type: Date, required: true },
  durationMinutes: { type: Number, default: 30 },
  status: {
    type: String,
    enum: ['scheduled', 'completed', 'cancelled', 'no-show'],
    default: 'scheduled',
  },
  reason: { type: String, trim: true },
  notes: { type: String, trim: true },
  urgency: {
    type: String,
    enum: ['routine', 'moderate', 'urgent', 'emergency'],
    default: 'routine',
  },
  reminder24hSent: { type: Boolean, default: false },
  reminder1hSent: { type: Boolean, default: false },
  rescheduledAt: { type: Date },
  cancelledAt: { type: Date },
}, { timestamps: true });

appointmentSchema.index({ doctorName: 1, scheduledAt: 1, status: 1 });
appointmentSchema.index({ patient: 1, scheduledAt: -1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
