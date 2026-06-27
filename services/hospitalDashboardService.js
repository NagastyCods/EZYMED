const QueueEntry = require('../models/QueueEntry');
const Consultation = require('../models/Consultation');
const Appointment = require('../models/Appointment');
const SatisfactionRating = require('../models/SatisfactionRating');
const WardStatus = require('../models/WardStatus');
const { DOCTORS, DEPARTMENTS } = require('../config/doctors');
const { WARDS } = require('../config/hospital');
const { simulateQueueProgress } = require('./queueService');

const AVG_MINUTES_PER_PATIENT = 12;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function isDoctorOnSchedule(doctor) {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours() + now.getMinutes() / 60;

  if (!doctor.days.includes(day)) return false;
  if (doctor.endHour - doctor.startHour >= 24) return true;
  return hour >= doctor.startHour && hour < doctor.endHour;
}

async function ensureWardStatuses() {
  for (const ward of WARDS) {
    const existing = await WardStatus.findOne({ wardId: ward.id });
    if (!existing) {
      const defaultOccupied = Math.floor(ward.totalBeds * (0.45 + Math.random() * 0.25));
      await WardStatus.create({ wardId: ward.id, occupiedBeds: defaultOccupied });
    }
  }
}

async function getLiveQueue() {
  await simulateQueueProgress();

  const entries = await QueueEntry.find({
    status: { $in: ['waiting', 'called', 'in_consultation'] },
  })
    .populate('patient', 'firstName lastName phone')
    .sort({ department: 1, joinedAt: 1 });

  return entries.map((e) => {
    const waitMinutes = e.status === 'waiting'
      ? Math.max(0, Math.round((Date.now() - new Date(e.joinedAt).getTime()) / 60000))
      : 0;

    return {
      id: e._id,
      queueNumber: e.queueNumber,
      department: e.department,
      status: e.status,
      urgency: e.urgency,
      doctorName: e.doctorName,
      patientName: e.patient ? `${e.patient.firstName} ${e.patient.lastName}` : 'Unknown',
      waitMinutes,
      joinedAt: e.joinedAt,
    };
  });
}

async function getActiveConsultations() {
  return Consultation.find({
    status: { $in: ['waiting', 'active'] },
  })
    .populate('patient', 'firstName lastName email')
    .sort({ createdAt: 1 })
    .lean();
}

async function getWaitingTimes() {
  const active = await QueueEntry.find({
    status: { $in: ['waiting', 'called'] },
  });

  const byDept = {};

  active.forEach((e) => {
    if (!byDept[e.department]) {
      byDept[e.department] = { waits: [], count: 0, urgent: 0 };
    }
    const wait = Math.round((Date.now() - new Date(e.joinedAt).getTime()) / 60000);
    byDept[e.department].waits.push(wait);
    byDept[e.department].count += 1;
    if (e.urgency === 'urgent' || e.urgency === 'emergency') {
      byDept[e.department].urgent += 1;
    }
  });

  return Object.entries(byDept).map(([department, data]) => ({
    department,
    patientsWaiting: data.count,
    urgentCases: data.urgent,
    avgWaitMinutes: data.waits.length
      ? Math.round(data.waits.reduce((a, b) => a + b, 0) / data.waits.length)
      : 0,
    maxWaitMinutes: data.waits.length ? Math.max(...data.waits) : 0,
    estimatedClearMinutes: data.count * AVG_MINUTES_PER_PATIENT,
  }));
}

async function getDoctorAvailability() {
  const activeConsultations = await Consultation.find({
    status: 'active',
  }).select('doctorId doctorName');

  const inQueue = await QueueEntry.find({
    status: 'in_consultation',
  }).select('doctorName');

  const busyDoctorIds = new Set(activeConsultations.map((c) => c.doctorId).filter(Boolean));
  const busyDoctorNames = new Set([
    ...activeConsultations.map((c) => c.doctorName),
    ...inQueue.map((q) => q.doctorName),
  ].filter(Boolean));

  return DOCTORS.map((doc) => {
    let status = 'off_duty';
    if (isDoctorOnSchedule(doc)) {
      if (busyDoctorIds.has(doc.id) || busyDoctorNames.has(doc.name)) {
        status = 'in_consultation';
      } else {
        status = 'available';
      }
    }

    return {
      id: doc.id,
      name: doc.name,
      department: doc.department,
      title: doc.title,
      status,
      hours: `${doc.startHour}:00 – ${doc.endHour}:00`,
    };
  });
}

async function getBedOccupancy() {
  await ensureWardStatuses();
  const statuses = await WardStatus.find();
  const statusMap = Object.fromEntries(statuses.map((s) => [s.wardId, s.occupiedBeds]));

  const wards = WARDS.map((ward) => {
    const occupied = statusMap[ward.id] ?? 0;
    const available = Math.max(0, ward.totalBeds - occupied);
    const occupancyRate = ward.totalBeds
      ? Math.round((occupied / ward.totalBeds) * 100)
      : 0;

    return {
      ...ward,
      occupiedBeds: occupied,
      availableBeds: available,
      occupancyRate,
    };
  });

  const totalBeds = wards.reduce((s, w) => s + w.totalBeds, 0);
  const totalOccupied = wards.reduce((s, w) => s + w.occupiedBeds, 0);

  return {
    wards,
    summary: {
      totalBeds,
      occupiedBeds: totalOccupied,
      availableBeds: totalBeds - totalOccupied,
      occupancyRate: totalBeds ? Math.round((totalOccupied / totalBeds) * 100) : 0,
    },
  };
}

async function updateBedOccupancy(wardId, occupiedBeds) {
  const ward = WARDS.find((w) => w.id === wardId);
  if (!ward) throw new Error('Ward not found');

  if (occupiedBeds < 0 || occupiedBeds > ward.totalBeds) {
    throw new Error(`Occupied beds must be between 0 and ${ward.totalBeds}`);
  }

  const status = await WardStatus.findOneAndUpdate(
    { wardId },
    { occupiedBeds },
    { upsert: true, new: true }
  );

  return getBedOccupancy();
}

async function getDailyAppointments() {
  const start = startOfToday();
  const end = endOfToday();

  const appointments = await Appointment.find({
    scheduledAt: { $gte: start, $lte: end },
  })
    .populate('patient', 'firstName lastName')
    .sort({ scheduledAt: 1 });

  const summary = {
    total: appointments.length,
    scheduled: appointments.filter((a) => a.status === 'scheduled').length,
    completed: appointments.filter((a) => a.status === 'completed').length,
    cancelled: appointments.filter((a) => a.status === 'cancelled').length,
    noShow: appointments.filter((a) => a.status === 'no-show').length,
    virtual: appointments.filter((a) => a.type === 'virtual').length,
    inPerson: appointments.filter((a) => a.type === 'in-person').length,
  };

  return {
    summary,
    appointments: appointments.map((a) => ({
      id: a._id,
      patientName: a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : 'Unknown',
      doctorName: a.doctorName,
      department: a.department,
      type: a.type,
      status: a.status,
      scheduledAt: a.scheduledAt,
    })),
  };
}

async function getQueueAnalytics() {
  const start = startOfToday();
  const end = endOfToday();

  const todayEntries = await QueueEntry.find({
    joinedAt: { $gte: start, $lte: end },
  });

  const completed = todayEntries.filter((e) => e.status === 'completed');
  const cancelled = todayEntries.filter((e) => e.status === 'cancelled');
  const active = todayEntries.filter((e) =>
    ['waiting', 'called', 'in_consultation'].includes(e.status)
  );

  const waitTimes = completed
    .filter((e) => e.completedAt)
    .map((e) => (new Date(e.completedAt) - new Date(e.joinedAt)) / 60000);

  const byDepartment = {};
  todayEntries.forEach((e) => {
    if (!byDepartment[e.department]) {
      byDepartment[e.department] = { joined: 0, completed: 0, waiting: 0 };
    }
    byDepartment[e.department].joined += 1;
    if (e.status === 'completed') byDepartment[e.department].completed += 1;
    if (e.status === 'waiting') byDepartment[e.department].waiting += 1;
  });

  const hourlyVolume = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    count: 0,
  }));

  todayEntries.forEach((e) => {
    const hour = new Date(e.joinedAt).getHours();
    hourlyVolume[hour].count += 1;
  });

  const peakHour = hourlyVolume.reduce(
    (max, h) => (h.count > max.count ? h : max),
    { hour: 0, count: 0 }
  );

  return {
    today: {
      totalJoined: todayEntries.length,
      completed: completed.length,
      cancelled: cancelled.length,
      currentlyActive: active.length,
      avgWaitMinutes: waitTimes.length
        ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length)
        : 0,
      peakHour: peakHour.count > 0 ? peakHour.label : '—',
    },
    byDepartment: Object.entries(byDepartment).map(([department, stats]) => ({
      department,
      ...stats,
    })),
    hourlyVolume: hourlyVolume.filter((h) => h.count > 0 || (h.hour >= 8 && h.hour <= 18)),
  };
}

async function getPatientSatisfaction() {
  const start = startOfToday();
  const thirtyDaysAgo = new Date(start);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [todayRatings, recentRatings, allRecent] = await Promise.all([
    SatisfactionRating.find({ createdAt: { $gte: start } }),
    SatisfactionRating.find({ createdAt: { $gte: thirtyDaysAgo } }).sort({ createdAt: -1 }).limit(10),
    SatisfactionRating.find({ createdAt: { $gte: thirtyDaysAgo } }),
  ]);

  const avg = (list) => (list.length
    ? Math.round((list.reduce((s, r) => s + r.rating, 0) / list.length) * 10) / 10
    : null);

  const distribution = [1, 2, 3, 4, 5].map((star) => ({
    stars: star,
    count: allRecent.filter((r) => r.rating === star).length,
  }));

  return {
    today: {
      count: todayRatings.length,
      average: avg(todayRatings),
    },
    last30Days: {
      count: allRecent.length,
      average: avg(allRecent),
    },
    distribution,
    recentFeedback: recentRatings.map((r) => ({
      rating: r.rating,
      comment: r.comment,
      category: r.category,
      createdAt: r.createdAt,
    })),
  };
}

async function getDashboardOverview() {
  const [
    liveQueue,
    activeConsultations,
    waitingTimes,
    doctorAvailability,
    bedOccupancy,
    dailyAppointments,
    queueAnalytics,
    patientSatisfaction,
  ] = await Promise.all([
    getLiveQueue(),
    getActiveConsultations(),
    getWaitingTimes(),
    getDoctorAvailability(),
    getBedOccupancy(),
    getDailyAppointments(),
    getQueueAnalytics(),
    getPatientSatisfaction(),
  ]);

  const doctorsAvailable = doctorAvailability.filter((d) => d.status === 'available').length;
  const doctorsBusy = doctorAvailability.filter((d) => d.status === 'in_consultation').length;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      queueSize: liveQueue.length,
      activeConsultations: activeConsultations.length,
      doctorsAvailable,
      doctorsBusy,
      appointmentsToday: dailyAppointments.summary.total,
      bedOccupancyRate: bedOccupancy.summary.occupancyRate,
      satisfactionScore: patientSatisfaction.last30Days.average,
    },
    liveQueue,
    activeConsultations,
    waitingTimes,
    doctorAvailability,
    bedOccupancy,
    dailyAppointments,
    queueAnalytics,
    patientSatisfaction,
    departments: DEPARTMENTS,
  };
}

module.exports = {
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
};
