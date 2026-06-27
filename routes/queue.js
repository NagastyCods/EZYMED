const express = require('express');
const auth = require('../middleware/auth');
const {
  joinQueue,
  getQueueStatus,
  leaveQueue,
  getQueueHistory,
  getDepartmentStats,
  DEPARTMENTS,
} = require('../services/queueService');

const router = express.Router();

router.use(auth);

router.get('/departments', (_req, res) => {
  res.json({ departments: DEPARTMENTS });
});

router.get('/stats/:department', async (req, res) => {
  try {
    const stats = await getDepartmentStats(req.params.department);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/join', async (req, res) => {
  try {
    const { department, reason, urgency, appointmentId } = req.body;
    const status = await joinQueue(req.patientId, {
      department,
      reason,
      urgency,
      appointmentId,
    });

    res.status(201).json({
      message: 'You have joined the virtual queue',
      queue: status,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const queue = await getQueueStatus(req.patientId);
    res.json({ queue, inQueue: Boolean(queue) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/leave', async (req, res) => {
  try {
    const result = await leaveQueue(req.patientId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/history', async (req, res) => {
  try {
    const history = await getQueueHistory(req.patientId);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
