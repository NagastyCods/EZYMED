const mongoose = require('mongoose');

const satisfactionSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
  },
  consultation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Consultation',
    default: null,
  },
  queueEntry: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QueueEntry',
    default: null,
  },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true, maxlength: 500 },
  category: {
    type: String,
    enum: ['consultation', 'queue', 'appointment', 'general'],
    default: 'general',
  },
}, { timestamps: true });

satisfactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SatisfactionRating', satisfactionSchema);
