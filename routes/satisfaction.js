const express = require('express');
const auth = require('../middleware/auth');
const SatisfactionRating = require('../models/SatisfactionRating');
const Consultation = require('../models/Consultation');
const QueueEntry = require('../models/QueueEntry');

const router = express.Router();

router.use(auth);

router.post('/', async (req, res) => {
  try {
    const { rating, comment, category, consultationId, queueEntryId } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Please provide a rating from 1 to 5.' });
    }

    if (consultationId) {
      const consultation = await Consultation.findOne({
        _id: consultationId,
        patient: req.patientId,
        status: 'ended',
      });
      if (!consultation) {
        return res.status(404).json({ message: 'Completed consultation not found.' });
      }
    }

    if (queueEntryId) {
      const entry = await QueueEntry.findOne({
        _id: queueEntryId,
        patient: req.patientId,
        status: 'completed',
      });
      if (!entry) {
        return res.status(404).json({ message: 'Completed queue visit not found.' });
      }
    }

    const existing = await SatisfactionRating.findOne({
      patient: req.patientId,
      consultation: consultationId || null,
      queueEntry: queueEntryId || null,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    if (existing) {
      return res.status(400).json({ message: 'You have already submitted feedback for this visit.' });
    }

    const record = await SatisfactionRating.create({
      patient: req.patientId,
      rating: Number(rating),
      comment: comment?.trim(),
      category: category || 'general',
      consultation: consultationId || null,
      queueEntry: queueEntryId || null,
    });

    res.status(201).json({ message: 'Thank you for your feedback!', rating: record });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
