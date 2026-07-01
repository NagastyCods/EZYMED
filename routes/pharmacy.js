const express = require('express');
const {
  authenticatePharmacist,
  pharmacyAuth,
  PHARMACIES,
} = require('../middleware/pharmacyAuth');
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

router.post('/auth/login', async (req, res) => {
  try {
    const { pharmacyId, password } = req.body;
    if (!pharmacyId || !password) {
      return res.status(400).json({ message: 'Pharmacy and password are required' });
    }

    const { pharmacy, token } = await authenticatePharmacist(pharmacyId, password, req);
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

router.get('/dashboard', async (req, res) => {
  try {
    const data = await getPharmacyDashboard(req.pharmacyId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/orders', async (req, res) => {
  try {
    const orders = await getOrders(req.pharmacyId, { status: req.query.status });
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/orders/:id', async (req, res) => {
  try {
    const order = await getOrder(req.pharmacyId, req.params.id);
    res.json({ order });
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
});

router.patch('/orders/:id/claim', async (req, res) => {
  try {
    const order = await claimOrder(req.pharmacyId, req.params.id, req);
    res.json({ message: 'Prescription claimed', order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/orders/:id/verify', async (req, res) => {
  try {
    const order = await verifyOrder(req.pharmacyId, req.params.id, req.body, req);
    res.json({ message: 'Medication verified', order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/orders/:id/prepare', async (req, res) => {
  try {
    const order = await prepareOrder(req.pharmacyId, req.params.id, req);
    res.json({ message: 'Preparation started', order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/orders/:id/ready', async (req, res) => {
  try {
    const order = await markReady(req.pharmacyId, req.params.id, req);
    res.json({ message: 'Order marked ready', order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/orders/:id/delivery', async (req, res) => {
  try {
    const order = await coordinateDelivery(req.pharmacyId, req.params.id, req.body, req);
    res.json({ message: 'Delivery coordinated', order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/orders/:id/notify', async (req, res) => {
  try {
    const order = await notifyPatient(req.pharmacyId, req.params.id, req.body, req);
    res.json({ message: 'Patient notified', order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/orders/:id/complete', async (req, res) => {
  try {
    const order = await completeOrder(req.pharmacyId, req.params.id, req);
    res.json({ message: 'Order completed', order });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
