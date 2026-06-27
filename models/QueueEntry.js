const mongoose = require('mongoose');

const queueEntrySchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
  },
  queueNumber: { type: String, required: true, unique: true },
  department: { type: String, required: true, trim: true },
  doctorName: { type: String, trim: true, default: null },
  status: {
    type: String,
    enum: ['waiting', 'called', 'in_consultation', 'completed', 'cancelled'],
    default: 'waiting',
  },
  urgency: {
    type: String,
    enum: ['routine', 'moderate', 'urgent', 'emergency'],
    default: 'routine',
  },
  reason: { type: String, trim: true },
  appointment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    default: null,
  },
  joinedAt: { type: Date, default: Date.now },
  calledAt: { type: Date },
  completedAt: { type: Date },
  estimatedWaitMinutes: { type: Number, default: 0 },
  notifiedAlmostTurn: { type: Boolean, default: false },
  notifiedCalled: { type: Boolean, default: false },
}, { timestamps: true });

queueEntrySchema.index({ department: 1, status: 1, joinedAt: 1 });
queueEntrySchema.index({ patient: 1, status: 1 });

module.exports = mongoose.model('QueueEntry', queueEntrySchema);
