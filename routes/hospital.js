const express = require('express');
const { authenticateAdmin, adminAuth } = require('../middleware/adminAuth');
const {
  getDashboardOverview,
  getLiveQueue,
  getActiveConsultations,
  getWaitingTimes,
  getDoctorAvailability,
  getBedOccupancy,
  updateBedOccupancy,
  getDailyAppointments,
  getQueueAnalytics,
  getPatientSatisfaction,
} = require('../services/hospitalDashboardService');

const router = express.Router();

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const result = await authenticateAdmin(email, password, req);
    if (result.requiresMfa) {
      return res.json({
        message: 'MFA verification required',
        requiresMfa: true,
        mfaToken: result.mfaToken,
        admin: result.admin,
      });
    }

    const { admin, token } = result;
    res.json({ message: 'Login successful', token, admin });
  } catch (err) {
    res.status(401).json({ message: err.message });
  }
});

router.use(adminAuth);

router.get('/dashboard', async (_req, res) => {
  try {
    const data = await getDashboardOverview();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/queue', async (_req, res) => {
  try {
    const queue = await getLiveQueue();
    res.json({ queue });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/consultations', async (_req, res) => {
  try {
    const consultations = await getActiveConsultations();
    res.json({ consultations });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/waiting-times', async (_req, res) => {
  try {
    const waitingTimes = await getWaitingTimes();
    res.json({ waitingTimes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/doctors', async (_req, res) => {
  try {
    const doctors = await getDoctorAvailability();
    res.json({ doctors });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/beds', async (_req, res) => {
  try {
    const bedOccupancy = await getBedOccupancy();
    res.json(bedOccupancy);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/beds/:wardId', async (req, res) => {
  try {
    const { occupiedBeds } = req.body;
    if (occupiedBeds === undefined) {
      return res.status(400).json({ message: 'occupiedBeds is required' });
    }

    const bedOccupancy = await updateBedOccupancy(req.params.wardId, Number(occupiedBeds));
    res.json({ message: 'Bed occupancy updated', bedOccupancy });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/appointments/today', async (_req, res) => {
  try {
    const data = await getDailyAppointments();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/analytics/queue', async (_req, res) => {
  try {
    const analytics = await getQueueAnalytics();
    res.json(analytics);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/satisfaction', async (_req, res) => {
  try {
    const satisfaction = await getPatientSatisfaction();
    res.json(satisfaction);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
