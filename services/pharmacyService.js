const PharmacyOrder = require('../models/PharmacyOrder');
const ClinicalRecord = require('../models/ClinicalRecord');
const Patient = require('../models/Patient');
const { findPharmacyById } = require('../config/pharmacies');
const { logAudit } = require('./auditService');

const STATUS_FLOW = {
  received: ['verified', 'cancelled'],
  verified: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'completed', 'cancelled'],
  out_for_delivery: ['completed', 'cancelled'],
};

function pushHistory(order, status, pharmacyId, note) {
  order.statusHistory.push({ status, note, byPharmacyId: pharmacyId, at: new Date() });
}

async function receivePrescription(clinicalRecord) {
  if (clinicalRecord.type !== 'prescription') return null;

  const existing = await PharmacyOrder.findOne({ prescription: clinicalRecord._id });
  if (existing) return existing;

  const details = clinicalRecord.details || {};
  const order = await PharmacyOrder.create({
    prescription: clinicalRecord._id,
    patient: clinicalRecord.patient,
    medication: clinicalRecord.title,
    dosage: details.dosage,
    frequency: details.frequency,
    duration: details.duration,
    instructions: details.instructions,
    doctorId: clinicalRecord.doctorId,
    doctorName: clinicalRecord.doctorName,
    status: 'received',
    statusHistory: [{ status: 'received', note: 'E-prescription received from doctor', at: new Date() }],
  });

  return order;
}

async function backfillPrescriptions() {
  const prescriptions = await ClinicalRecord.find({ type: 'prescription' }).sort({ createdAt: 1 });
  let created = 0;
  for (const rx of prescriptions) {
    const exists = await PharmacyOrder.findOne({ prescription: rx._id });
    if (!exists) {
      await receivePrescription(rx);
      created += 1;
    }
  }
  return created;
}

async function getPharmacyDashboard(pharmacyId) {
  const pharmacy = findPharmacyById(pharmacyId);
  if (!pharmacy) throw new Error('Pharmacy not found');

  const baseFilter = {
    $or: [{ pharmacyId }, { pharmacyId: { $exists: false } }, { pharmacyId: null }],
    status: { $ne: 'cancelled' },
  };

  const [received, verified, preparing, ready, outForDelivery, recentOrders] = await Promise.all([
    PharmacyOrder.countDocuments({ ...baseFilter, status: 'received' }),
    PharmacyOrder.countDocuments({ pharmacyId, status: 'verified' }),
    PharmacyOrder.countDocuments({ pharmacyId, status: 'preparing' }),
    PharmacyOrder.countDocuments({ pharmacyId, status: 'ready' }),
    PharmacyOrder.countDocuments({ pharmacyId, status: 'out_for_delivery' }),
    PharmacyOrder.find(baseFilter)
      .populate('patient', 'firstName lastName email phone')
      .sort({ createdAt: -1 })
      .limit(50),
  ]);

  return {
    pharmacy,
    stats: { received, verified, preparing, ready, outForDelivery },
    orders: recentOrders,
  };
}

async function getOrders(pharmacyId, { status } = {}) {
  const filter = {
    $or: [{ pharmacyId }, { pharmacyId: { $exists: false } }, { pharmacyId: null }],
  };
  if (status) filter.status = status;
  else filter.status = { $ne: 'cancelled' };

  return PharmacyOrder.find(filter)
    .populate('patient', 'firstName lastName email phone')
    .sort({ createdAt: -1 });
}

async function getOrder(pharmacyId, orderId) {
  const order = await PharmacyOrder.findById(orderId).populate('patient', 'firstName lastName email phone');
  if (!order) throw new Error('Order not found');
  return order;
}

async function claimOrder(pharmacyId, orderId, req) {
  const order = await PharmacyOrder.findById(orderId);
  if (!order) throw new Error('Order not found');
  if (order.pharmacyId && order.pharmacyId !== pharmacyId) {
    throw new Error('This prescription is assigned to another pharmacy');
  }
  if (order.status !== 'received') throw new Error('Only new prescriptions can be claimed');

  order.pharmacyId = pharmacyId;
  pushHistory(order, 'received', pharmacyId, `Claimed by ${findPharmacyById(pharmacyId)?.name}`);
  await order.save();

  await logAudit({
    actorRole: 'pharmacist',
    actorId: pharmacyId,
    action: 'pharmacy.claim',
    resourceType: 'pharmacy_order',
    resourceId: order._id.toString(),
    patientId: order.patient,
    req,
  });

  return order.populate('patient', 'firstName lastName email phone');
}

async function verifyOrder(pharmacyId, orderId, { verificationNotes }, req) {
  return updateOrderStatus(pharmacyId, orderId, 'verified', {
    verificationNotes,
    note: verificationNotes || 'Medication verified',
  }, req);
}

async function prepareOrder(pharmacyId, orderId, req) {
  return updateOrderStatus(pharmacyId, orderId, 'preparing', { note: 'Order preparation started' }, req);
}

async function markReady(pharmacyId, orderId, req) {
  return updateOrderStatus(pharmacyId, orderId, 'ready', { note: 'Order ready for pickup or delivery' }, req);
}

async function coordinateDelivery(pharmacyId, orderId, payload, req) {
  const order = await assertPharmacyOrder(pharmacyId, orderId);
  if (!['ready', 'out_for_delivery'].includes(order.status)) {
    throw new Error('Order must be ready before coordinating delivery');
  }

  order.deliveryMethod = payload.deliveryMethod || 'delivery';
  order.deliveryAddress = payload.deliveryAddress?.trim();
  order.deliveryScheduledAt = payload.deliveryScheduledAt ? new Date(payload.deliveryScheduledAt) : undefined;
  order.deliveryNotes = payload.deliveryNotes?.trim();
  order.status = 'out_for_delivery';
  pushHistory(order, 'out_for_delivery', pharmacyId, payload.deliveryNotes || 'Out for delivery');
  await order.save();

  await logAudit({
    actorRole: 'pharmacist',
    actorId: pharmacyId,
    action: 'pharmacy.delivery',
    resourceType: 'pharmacy_order',
    resourceId: order._id.toString(),
    patientId: order.patient,
    req,
    metadata: { deliveryMethod: order.deliveryMethod },
  });

  return order.populate('patient', 'firstName lastName email phone');
}

async function notifyPatient(pharmacyId, orderId, { message }, req) {
  const order = await assertPharmacyOrder(pharmacyId, orderId);
  if (!['ready', 'out_for_delivery'].includes(order.status)) {
    throw new Error('Notify patients when the order is ready or out for delivery');
  }

  const pharmacy = findPharmacyById(pharmacyId);
  const defaultMsg = order.status === 'ready'
    ? `Your prescription (${order.medication}) is ready at ${pharmacy?.name}.`
    : `Your prescription (${order.medication}) is on the way from ${pharmacy?.name}.`;

  order.notificationMessage = message?.trim() || defaultMsg;
  order.patientNotifiedAt = new Date();
  await order.save();

  await logAudit({
    actorRole: 'pharmacist',
    actorId: pharmacyId,
    action: 'pharmacy.notify_patient',
    resourceType: 'pharmacy_order',
    resourceId: order._id.toString(),
    patientId: order.patient,
    req,
  });

  return order.populate('patient', 'firstName lastName email phone');
}

async function completeOrder(pharmacyId, orderId, req) {
  return updateOrderStatus(pharmacyId, orderId, 'completed', { note: 'Order fulfilled' }, req);
}

async function assertPharmacyOrder(pharmacyId, orderId) {
  const order = await PharmacyOrder.findById(orderId);
  if (!order) throw new Error('Order not found');
  if (order.pharmacyId && order.pharmacyId !== pharmacyId) {
    throw new Error('This order belongs to another pharmacy');
  }
  if (!order.pharmacyId && order.status !== 'received') {
    throw new Error('Claim this prescription before updating it');
  }
  return order;
}

async function updateOrderStatus(pharmacyId, orderId, newStatus, { verificationNotes, note }, req) {
  const order = await assertPharmacyOrder(pharmacyId, orderId);

  if (order.status === 'received' && !order.pharmacyId) {
    order.pharmacyId = pharmacyId;
  }

  const allowed = STATUS_FLOW[order.status] || [];
  if (!allowed.includes(newStatus) && order.status !== newStatus) {
    throw new Error(`Cannot move order from ${order.status} to ${newStatus}`);
  }

  order.status = newStatus;
  if (verificationNotes !== undefined) order.verificationNotes = verificationNotes;
  pushHistory(order, newStatus, pharmacyId, note);
  await order.save();

  await logAudit({
    actorRole: 'pharmacist',
    actorId: pharmacyId,
    action: `pharmacy.${newStatus}`,
    resourceType: 'pharmacy_order',
    resourceId: order._id.toString(),
    patientId: order.patient,
    req,
  });

  return order.populate('patient', 'firstName lastName email phone');
}

async function getPatientPharmacyOrders(patientId) {
  return PharmacyOrder.find({ patient: patientId, status: { $ne: 'cancelled' } })
    .sort({ updatedAt: -1 });
}

module.exports = {
  receivePrescription,
  backfillPrescriptions,
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
  getPatientPharmacyOrders,
};
