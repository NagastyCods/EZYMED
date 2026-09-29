const express = require('express');
const {
  authenticatePharmacist,
  pharmacyAuth,
  PHARMACIES,
} = require('../middleware/pharmacyAuth');
const { authRateLimit } = require('../middleware/rateLimit');
const { requirePermission } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/roles');
const {
  getPharmacyDashboard,
  getOrders,
  getOrder,
  claimOrder,
  verifyOrder,
  prepareOrder,
  markReady,
  coordinateDelivery,
  notifyPatient,
  completeOrder,
} = require('../services/pharmacyService');

const router = express.Router();

router.get('/list', (_req, res) => {
  res.json({
    pharmacies: PHARMACIES.map(({ id, name, address, phone, hours }) => ({
      id, name, address, phone, hours,
    })),
  });
});

router.post('/auth/login', authRateLimit, async (req, res) => {
  try {
    const { pharmacyId, password } = req.body;
    if (!pharmacyId || !password) {
      return res.status(400).json({ message: 'Pharmacy and password are required' });
    }

    const result = await authenticatePharmacist(pharmacyId, password, req);
    if (result.requiresMfa) {
      return res.json({
        message: 'MFA verification required',
        requiresMfa: true,
        mfaToken: result.mfaToken,
        pharmacy: result.pharmacy,
      });
    }

    const { pharmacy, token } = result;
    res.json({
      message: 'Login successful',
      token,
      pharmacy: { id: pharmacy.id, name: pharmacy.name, address: pharmacy.address, phone: pharmacy.phone },
    });
  } catch (err) {
    res.status(401).json({ message: err.message });
  }
});

router.use(pharmacyAuth);

router.get('/dashboard', requirePermission(PERMISSIONS.PHARMACY_ORDERS), async (req, res) => {
  try {
    const data = await getPharmacyDashboard(req.pharmacyId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/orders', requirePermission(PERMISSIONS.PHARMACY_ORDERS), async (req, res) => {
  try {
    const orders = await getOrders(req.pharmacyId, { status: req.query.status });
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/orders/:id', requirePermission(PERMISSIONS.PHARMACY_ORDERS), async (req, res) => {
  try {
    const order = await getOrder(req.pharmacyId, req.params.id);
    res.json({ order });
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
});

router.patch('/orders/:id/claim', requirePermission(PERMISSIONS.PHARMACY_ORDERS), async (req, res) => {
  try {
    const order = await claimOrder(req.pharmacyId, req.params.id, req);
    res.json({ message: 'Prescription claimed', order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/orders/:id/verify', requirePermission(PERMISSIONS.PHARMACY_ORDERS), async (req, res) => {
  try {
    const order = await verifyOrder(req.pharmacyId, req.params.id, req.body, req);
    res.json({ message: 'Medication verified', order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/orders/:id/prepare', requirePermission(PERMISSIONS.PHARMACY_ORDERS), async (req, res) => {
  try {
    const order = await prepareOrder(req.pharmacyId, req.params.id, req);
    res.json({ message: 'Preparation started', order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/orders/:id/ready', requirePermission(PERMISSIONS.PHARMACY_ORDERS), async (req, res) => {
  try {
    const order = await markReady(req.pharmacyId, req.params.id, req);
    res.json({ message: 'Order marked ready', order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/orders/:id/delivery', requirePermission(PERMISSIONS.PHARMACY_ORDERS), async (req, res) => {
  try {
    const order = await coordinateDelivery(req.pharmacyId, req.params.id, req.body, req);
    res.json({ message: 'Delivery coordinated', order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/orders/:id/notify', requirePermission(PERMISSIONS.PHARMACY_NOTIFY), async (req, res) => {
  try {
    const order = await notifyPatient(req.pharmacyId, req.params.id, req.body, req);
    res.json({ message: 'Patient notified', order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/orders/:id/complete', requirePermission(PERMISSIONS.PHARMACY_ORDERS), async (req, res) => {
  try {
    const order = await completeOrder(req.pharmacyId, req.params.id, req);
    res.json({ message: 'Order completed', order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
