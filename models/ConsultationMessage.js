const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  consultation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Consultation',
    required: true,
  },
  senderType: { type: String, enum: ['patient', 'doctor'], required: true },
  senderName: { type: String, trim: true },
  content: { type: String, required: true, trim: true },
}, { timestamps: true });

messageSchema.index({ consultation: 1, createdAt: 1 });

module.exports = mongoose.model('ConsultationMessage', messageSchema);
