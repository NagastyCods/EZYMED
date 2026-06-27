const QueueEntry = require('../models/QueueEntry');
const { DEPARTMENT_CODES, DEPARTMENT_DOCTORS } = require('../config/doctors');

const AVG_MINUTES_PER_PATIENT = 12;

const URGENCY_WEIGHT = { emergency: 4, urgent: 3, moderate: 2, routine: 1 };

function getDepartmentCode(department) {
  return DEPARTMENT_CODES[department] || 'GP';
}

function pickDoctor(department, queueNumber) {
  const doctors = DEPARTMENT_DOCTORS[department] || DEPARTMENT_DOCTORS['General Medicine'];
  const index = parseInt(queueNumber.replace(/\D/g, ''), 10) % doctors.length;
  return doctors[index];
}

async function generateQueueNumber(department) {
  const code = getDepartmentCode(department);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const count = await QueueEntry.countDocuments({
    department,
    joinedAt: { $gte: startOfDay },
  });

  return `${code}-${String(count + 1).padStart(3, '0')}`;
}

function sortQueueEntries(entries) {
  return [...entries].sort((a, b) => {
    const weightDiff = (URGENCY_WEIGHT[b.urgency] || 1) - (URGENCY_WEIGHT[a.urgency] || 1);
    if (weightDiff !== 0) return weightDiff;
    return new Date(a.joinedAt) - new Date(b.joinedAt);
  });
}

async function getActiveQueueForDepartment(department) {
  return QueueEntry.find({
    department,
    status: { $in: ['waiting', 'called', 'in_consultation'] },
  });
}

async function computePosition(entry, activeEntries) {
  const sorted = sortQueueEntries(
    activeEntries.filter((e) => e.status === 'waiting' || e._id.equals(entry._id))
  );
  const idx = sorted.findIndex((e) => e._id.equals(entry._id));
  return idx >= 0 ? idx + 1 : 0;
}

function computeEstimatedWait(position, status) {
  if (status === 'called') return 0;
  if (status === 'in_consultation') return 0;
  return Math.max(0, (position - 1) * AVG_MINUTES_PER_PATIENT);
}

async function assignDoctorsToUpcoming(department) {
  const waiting = sortQueueEntries(
    await QueueEntry.find({ department, status: 'waiting' })
  );

  for (let i = 0; i < waiting.length; i += 1) {
    const entry = waiting[i];
    if (i < 3 && !entry.doctorName) {
      entry.doctorName = pickDoctor(department, entry.queueNumber);
      await entry.save();
    }
  }
}

async function simulateQueueProgress() {
  const departments = [...new Set(Object.keys(DEPARTMENT_CODES).concat(['General Medicine']))];

  for (const department of departments) {
    const inConsultation = await QueueEntry.findOne({
      department,
      status: 'in_consultation',
    }).sort({ calledAt: 1 });

    if (inConsultation?.calledAt) {
      const consultMinutes = (Date.now() - new Date(inConsultation.calledAt).getTime()) / 60000;
      if (consultMinutes >= AVG_MINUTES_PER_PATIENT) {
        inConsultation.status = 'completed';
        inConsultation.completedAt = new Date();
        await inConsultation.save();
      }
    }

    const called = await QueueEntry.findOne({ department, status: 'called' }).sort({ calledAt: 1 });
    if (called?.calledAt) {
      const waitMinutes = (Date.now() - new Date(called.calledAt).getTime()) / 60000;
      if (waitMinutes >= 2) {
        called.status = 'in_consultation';
        await called.save();
      }
    }

    const hasActive = await QueueEntry.exists({
      department,
      status: { $in: ['called', 'in_consultation'] },
    });

    if (!hasActive) {
      const next = sortQueueEntries(
        await QueueEntry.find({ department, status: 'waiting' })
      )[0];

      if (next) {
        const waitMinutes = (Date.now() - new Date(next.joinedAt).getTime()) / 60000;
        const activeCount = await QueueEntry.countDocuments({
          department,
          status: { $in: ['waiting', 'called', 'in_consultation'] },
        });

        if (waitMinutes >= AVG_MINUTES_PER_PATIENT || activeCount === 1) {
          next.status = 'called';
          next.calledAt = new Date();
          if (!next.doctorName) {
            next.doctorName = pickDoctor(department, next.queueNumber);
          }
          await next.save();
        }
      }
    }

    await assignDoctorsToUpcoming(department);
  }
}

function buildNotifications(entry, position) {
  const notifications = [];

  if (entry.status === 'waiting' && position <= 2 && position > 0) {
    notifications.push({
      type: 'almost_turn',
      title: 'Almost your turn!',
      message: position === 1
        ? 'You are next in line. Please stay ready for your consultation.'
        : `Only ${position - 1} patient(s) ahead of you. Estimated wait: ${computeEstimatedWait(position, entry.status)} minutes.`,
      priority: 'high',
    });
  }

  if (entry.status === 'called') {
    notifications.push({
      type: 'called',
      title: 'It\'s your turn now!',
      message: `${entry.doctorName || 'Your doctor'} is ready to see you. Please join your consultation.`,
      priority: 'urgent',
    });
  }

  if (entry.status === 'in_consultation') {
    notifications.push({
      type: 'in_consultation',
      title: 'Consultation in progress',
      message: `You are now with ${entry.doctorName || 'your doctor'}.`,
      priority: 'info',
    });
  }

  return notifications;
}

async function enrichEntry(entry) {
  const activeEntries = await getActiveQueueForDepartment(entry.department);
  const position = entry.status === 'waiting'
    ? await computePosition(entry, activeEntries)
    : 0;
  const estimatedWaitMinutes = computeEstimatedWait(position, entry.status);
  const aheadCount = Math.max(0, position - 1);

  entry.estimatedWaitMinutes = estimatedWaitMinutes;
  await entry.save();

  const notifications = buildNotifications(entry, position);
  const newNotifications = [];

  if (entry.status === 'waiting' && position <= 2 && !entry.notifiedAlmostTurn) {
    entry.notifiedAlmostTurn = true;
    newNotifications.push(...notifications.filter((n) => n.type === 'almost_turn'));
    await entry.save();
  }

  if (entry.status === 'called' && !entry.notifiedCalled) {
    entry.notifiedCalled = true;
    newNotifications.push(...notifications.filter((n) => n.type === 'called'));
    await entry.save();
  }

  return {
    queueNumber: entry.queueNumber,
    department: entry.department,
    doctorName: entry.doctorName,
    status: entry.status,
    urgency: entry.urgency,
    reason: entry.reason,
    position,
    aheadCount,
    estimatedWaitMinutes,
    joinedAt: entry.joinedAt,
    calledAt: entry.calledAt,
    notifications: newNotifications.length ? newNotifications : notifications,
    id: entry._id,
  };
}

async function getActiveEntry(patientId) {
  return QueueEntry.findOne({
    patient: patientId,
    status: { $in: ['waiting', 'called', 'in_consultation'] },
  }).sort({ joinedAt: -1 });
}

async function joinQueue(patientId, { department, reason, urgency, appointmentId }) {
  const existing = await getActiveEntry(patientId);
  if (existing) {
    throw new Error('You are already in the virtual queue. Check your queue status below.');
  }

  const dept = department || 'General Medicine';
  const queueNumber = await generateQueueNumber(dept);
  const activeEntries = await getActiveQueueForDepartment(dept);
  const position = activeEntries.filter((e) => e.status === 'waiting').length + 1;

  const entry = await QueueEntry.create({
    patient: patientId,
    queueNumber,
    department: dept,
    reason,
    urgency: urgency || 'routine',
    appointment: appointmentId || null,
    estimatedWaitMinutes: computeEstimatedWait(position, 'waiting'),
    doctorName: position <= 3 ? pickDoctor(dept, queueNumber) : null,
  });

  await assignDoctorsToUpcoming(dept);
  return enrichEntry(entry);
}

async function getQueueStatus(patientId) {
  await simulateQueueProgress();

  const entry = await getActiveEntry(patientId);
  if (!entry) return null;

  return enrichEntry(entry);
}

async function leaveQueue(patientId) {
  const entry = await getActiveEntry(patientId);
  if (!entry) {
    throw new Error('You are not currently in the queue.');
  }

  entry.status = 'cancelled';
  entry.completedAt = new Date();
  await entry.save();
  return { message: 'You have left the virtual queue.' };
}

async function getQueueHistory(patientId) {
  return QueueEntry.find({ patient: patientId })
    .sort({ joinedAt: -1 })
    .limit(20);
}

async function getDepartmentStats(department) {
  const active = await QueueEntry.find({
    department,
    status: { $in: ['waiting', 'called', 'in_consultation'] },
  });
  const waiting = active.filter((e) => e.status === 'waiting').length;
  return {
    department,
    waitingCount: waiting,
    totalActive: active.length,
    averageWaitMinutes: Math.max(0, (waiting - 1) * AVG_MINUTES_PER_PATIENT),
  };
}

module.exports = {
  joinQueue,
  getQueueStatus,
  leaveQueue,
  getQueueHistory,
  getDepartmentStats,
  simulateQueueProgress,
  DEPARTMENTS: Object.keys(DEPARTMENT_DOCTORS),
};
