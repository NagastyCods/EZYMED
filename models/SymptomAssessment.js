const mongoose = require('mongoose');

const possibleConditionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  likelihood: { type: String, enum: ['low', 'moderate', 'high'], default: 'moderate' },
  explanation: { type: String, trim: true },
}, { _id: false });

const symptomAssessmentSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
  },
  responses: { type: mongoose.Schema.Types.Mixed, required: true },
  possibleConditions: [possibleConditionSchema],
  urgency: {
    type: String,
    enum: ['routine', 'moderate', 'urgent', 'emergency'],
    required: true,
  },
  department: { type: String, required: true },
  recommendation: {
    type: String,
    enum: ['stay_home', 'book_consultation', 'seek_emergency'],
    required: true,
  },
  recommendationTitle: { type: String, required: true },
  recommendationDetail: { type: String, required: true },
  disclaimer: { type: String, required: true },
  provider: { type: String, enum: ['openai', 'rules-fallback'], default: 'openai' },
  model: { type: String, trim: true },
}, { timestamps: true });

module.exports = mongoose.model('SymptomAssessment', symptomAssessmentSchema);
