const express = require('express');
const { authenticateAdmin, adminAuth } = require('../middleware/adminAuth');
const { authRateLimit } = require('../middleware/rateLimit');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/roles');
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

router.post('/auth/login', authRateLimit, async (req, res) => {
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

router.get('/dashboard', requirePermission(PERMISSIONS.HOSPITAL_MONITOR), async (_req, res) => {
  try {
    const data = await getDashboardOverview();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/queue', requirePermission(PERMISSIONS.HOSPITAL_MONITOR), async (_req, res) => {
  try {
    const queue = await getLiveQueue();
    res.json({ queue });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/consultations', requirePermission(PERMISSIONS.HOSPITAL_MONITOR), async (_req, res) => {
  try {
    const consultations = await getActiveConsultations();
    res.json({ consultations });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/waiting-times', requirePermission(PERMISSIONS.HOSPITAL_MONITOR), async (_req, res) => {
  try {
    const waitingTimes = await getWaitingTimes();
    res.json({ waitingTimes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/doctors', requirePermission(PERMISSIONS.HOSPITAL_MONITOR), async (_req, res) => {
  try {
    const doctors = await getDoctorAvailability();
    res.json({ doctors });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/beds', requirePermission(PERMISSIONS.HOSPITAL_MONITOR), async (_req, res) => {
  try {
    const bedOccupancy = await getBedOccupancy();
    res.json(bedOccupancy);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/beds/:wardId', requirePermission(PERMISSIONS.HOSPITAL_BEDS), async (req, res) => {
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

router.get('/appointments/today', requirePermission(PERMISSIONS.HOSPITAL_MONITOR), async (_req, res) => {
  try {
    const data = await getDailyAppointments();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/analytics/queue', requirePermission(PERMISSIONS.HOSPITAL_MONITOR), async (_req, res) => {
  try {
    const analytics = await getQueueAnalytics();
    res.json(analytics);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/satisfaction', requirePermission(PERMISSIONS.HOSPITAL_MONITOR), async (_req, res) => {
  try {
    const satisfaction = await getPatientSatisfaction();
    res.json(satisfaction);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
