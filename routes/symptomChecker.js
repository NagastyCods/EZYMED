const express = require('express');
const SymptomAssessment = require('../models/SymptomAssessment');
const auth = require('../middleware/auth');
const { QUESTIONS, calculateAge, DISCLAIMER } = require('../services/symptomTriage');
const { analyzeSymptomsAI } = require('../services/openaiTriage');

const router = express.Router();

router.get('/questions', (_req, res) => {
  res.json({
    disclaimer: DISCLAIMER,
    steps: [
      { step: 1, title: 'Main concern', description: 'Tell us what brings you here today.' },
      { step: 2, title: 'Duration & severity', description: 'Help us understand how long and how intense your symptoms are.' },
      { step: 3, title: 'Other symptoms', description: 'Select any additional symptoms you are experiencing.' },
      { step: 4, title: 'Urgent warning signs', description: 'These questions help identify emergencies.' },
      { step: 5, title: 'Additional details', description: 'Share anything else in your own words (optional).' },
    ],
    questions: QUESTIONS,
  });
});

router.use(auth);

router.post('/analyze', async (req, res) => {
  try {
    const { responses } = req.body;

    if (!responses || !responses.chiefComplaint || !responses.duration || responses.severity === undefined) {
      return res.status(400).json({ message: 'Please complete all required questions before submitting.' });
    }

    const redFlags = Array.isArray(responses.redFlags) ? responses.redFlags : [];
    if (!redFlags.length) {
      return res.status(400).json({ message: 'Please answer the urgent warning signs question.' });
    }

    const age = calculateAge(req.patient.dateOfBirth);
    const result = await analyzeSymptomsAI(responses, {
      age,
      gender: req.patient.gender,
      allergies: req.patient.allergies,
      medications: req.patient.medications,
      medicalHistory: req.patient.medicalHistory,
    });

    const assessment = await SymptomAssessment.create({
      patient: req.patientId,
      responses,
      possibleConditions: result.possibleConditions,
      urgency: result.urgency,
      department: result.department,
      recommendation: result.recommendation,
      recommendationTitle: result.recommendationTitle,
      recommendationDetail: result.recommendationDetail,
      disclaimer: result.disclaimer,
      provider: result.provider || 'openai',
      model: result.model,
    });

    res.status(201).json({
      message: 'Symptom assessment complete',
      assessment,
      result,
    });
  } catch (err) {
    const status = err.message?.includes('OPENAI_API_KEY') ? 503 : 500;
    res.status(status).json({ message: err.message || 'Assessment failed' });
  }
});

router.get('/history', async (req, res) => {
  try {
    const assessments = await SymptomAssessment.find({ patient: req.patientId })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json({ assessments, disclaimer: DISCLAIMER });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const assessment = await SymptomAssessment.findOne({
      _id: req.params.id,
      patient: req.patientId,
    });

    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found' });
    }

    res.json({ assessment, disclaimer: DISCLAIMER });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
