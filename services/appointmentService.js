const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const { DOCTORS, DEPARTMENTS, findDoctorByName, findDoctorById } = require('../config/doctors');
const {
  sendAppointmentConfirmation,
  sendAppointmentReminder,
} = require('./notificationService');

const SLOT_MINUTES = 30;
const BOOKING_DAYS_AHEAD = 14;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateKey(date) {
  return startOfDay(date).toISOString().split('T')[0];
}

function generateSlotsForDoctor(doctor, date) {
  const day = date.getDay();
  if (!doctor.days.includes(day)) return [];

  const slots = [];
  const is24h = doctor.endHour - doctor.startHour >= 24;

  if (is24h) {
    for (let hour = 0; hour < 24; hour += 1) {
      for (let min of [0, 30]) {
        const slot = new Date(date);
        slot.setHours(hour, min, 0, 0);
        if (slot > new Date()) slots.push(slot);
      }
    }
    return slots;
  }

  for (let hour = doctor.startHour; hour < doctor.endHour; hour += 1) {
    for (let min of [0, 30]) {
      if (hour === doctor.endHour - 1 && min === 30) continue;
      const slotEnd = hour * 60 + min + SLOT_MINUTES;
      if (slotEnd > doctor.endHour * 60) continue;

      const slot = new Date(date);
      slot.setHours(hour, min, 0, 0);
      if (slot > new Date()) slots.push(slot);
    }
  }

  return slots;
}

async function getBookedSlots(doctorName, fromDate, toDate) {
  const appointments = await Appointment.find({
    doctorName,
    status: 'scheduled',
    scheduledAt: { $gte: fromDate, $lte: toDate },
  }).select('scheduledAt');

  return new Set(appointments.map((a) => new Date(a.scheduledAt).getTime()));
}

function listDoctors(department) {
  const doctors = department
    ? DOCTORS.filter((d) => d.department === department)
    : DOCTORS;

  return doctors.map(({ id, name, department: dept, title, days, startHour, endHour }) => ({
    id,
    name,
    department: dept,
    title,
    workingDays: days,
    hours: `${String(startHour).padStart(2, '0')}:00 – ${String(endHour).padStart(2, '0')}:00`,
  }));
}

async function getAvailability({ doctorId, doctorName, department, date }) {
  let doctor = doctorId ? findDoctorById(doctorId) : findDoctorByName(doctorName);

  if (!doctor && department) {
    const deptDoctors = DOCTORS.filter((d) => d.department === department);
    if (deptDoctors.length === 1) doctor = deptDoctors[0];
  }

  if (!doctor) {
    throw new Error('Doctor not found. Select a valid doctor or department.');
  }

  const targetDate = date ? startOfDay(new Date(date)) : startOfDay(new Date());
  const maxDate = startOfDay(new Date());
  maxDate.setDate(maxDate.getDate() + BOOKING_DAYS_AHEAD);

  if (targetDate < startOfDay(new Date())) {
    throw new Error('Cannot view availability for past dates.');
  }

  const dates = [];
  const cursor = new Date(targetDate);

  if (date) {
    dates.push(new Date(cursor));
  } else {
    for (let i = 0; i < BOOKING_DAYS_AHEAD; i += 1) {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const rangeEnd = new Date(dates[dates.length - 1]);
  rangeEnd.setHours(23, 59, 59, 999);
  const booked = await getBookedSlots(doctor.name, dates[0], rangeEnd);

  const availability = dates.map((d) => {
    const allSlots = generateSlotsForDoctor(doctor, d);
    const slots = allSlots.map((slot) => ({
      time: slot.toISOString(),
      label: slot.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      available: !booked.has(slot.getTime()),
    }));

    return {
      date: formatDateKey(d),
      dayName: d.toLocaleDateString(undefined, { weekday: 'long' }),
      slots,
      availableCount: slots.filter((s) => s.available).length,
    };
  });

  return {
    doctor: {
      id: doctor.id,
      name: doctor.name,
      department: doctor.department,
      title: doctor.title,
    },
    availability,
  };
}

async function isSlotAvailable(doctorName, scheduledAt, excludeAppointmentId = null) {
  const slotTime = new Date(scheduledAt).getTime();
  const query = {
    doctorName,
    status: 'scheduled',
    scheduledAt: new Date(scheduledAt),
  };

  if (excludeAppointmentId) {
    query._id = { $ne: excludeAppointmentId };
  }

  const conflict = await Appointment.findOne(query);
  return !conflict;
}

async function bookAppointment(patientId, data) {
  const { doctorId, doctorName, scheduledAt, type, reason, urgency, department } = data;

  if (!scheduledAt) throw new Error('Please select an appointment time slot.');

  const doctor = doctorId ? findDoctorById(doctorId) : findDoctorByName(doctorName);
  if (!doctor) throw new Error('Please select a valid doctor.');

  const slotDate = new Date(scheduledAt);
  if (slotDate <= new Date()) throw new Error('Appointment must be in the future.');

  const daySlots = generateSlotsForDoctor(doctor, startOfDay(slotDate));
  const validSlot = daySlots.some((s) => s.getTime() === slotDate.getTime());
  if (!validSlot) throw new Error('Selected time is outside this doctor\'s available hours.');

  const available = await isSlotAvailable(doctor.name, slotDate);
  if (!available) throw new Error('This time slot is no longer available. Please choose another.');

  const appointment = await Appointment.create({
    patient: patientId,
    doctorId: doctor.id,
    doctorName: doctor.name,
    department: department || doctor.department,
    scheduledAt: slotDate,
    type: type || 'virtual',
    reason,
    urgency: urgency || 'routine',
    durationMinutes: SLOT_MINUTES,
  });

  try {
    const patient = await Patient.findById(patientId);
    if (patient) await sendAppointmentConfirmation(patient, appointment);
  } catch {
    /* booking succeeds even if notification fails */
  }

  return appointment;
}

async function rescheduleAppointment(patientId, appointmentId, { scheduledAt, doctorId }) {
  const appointment = await Appointment.findOne({ _id: appointmentId, patient: patientId });
  if (!appointment) throw new Error('Appointment not found.');
  if (appointment.status !== 'scheduled') throw new Error('Only scheduled appointments can be rescheduled.');

  const doctor = doctorId
    ? findDoctorById(doctorId)
    : findDoctorByName(appointment.doctorName);
  if (!doctor) throw new Error('Doctor not found.');

  const slotDate = new Date(scheduledAt);
  if (slotDate <= new Date()) throw new Error('New appointment time must be in the future.');

  const available = await isSlotAvailable(doctor.name, slotDate, appointmentId);
  if (!available) throw new Error('This time slot is not available.');

  appointment.scheduledAt = slotDate;
  appointment.doctorId = doctor.id;
  appointment.doctorName = doctor.name;
  appointment.department = doctor.department;
  appointment.reminder24hSent = false;
  appointment.reminder1hSent = false;
  appointment.rescheduledAt = new Date();
  await appointment.save();

  return appointment;
}

async function cancelAppointment(patientId, appointmentId) {
  const appointment = await Appointment.findOne({ _id: appointmentId, patient: patientId });
  if (!appointment) throw new Error('Appointment not found.');
  if (appointment.status !== 'scheduled') throw new Error('Only scheduled appointments can be cancelled.');

  appointment.status = 'cancelled';
  appointment.cancelledAt = new Date();
  await appointment.save();
  return appointment;
}

async function getPatientReminders(patientId) {
  const now = new Date();
  const patient = await Patient.findById(patientId);
  const upcoming = await Appointment.find({
    patient: patientId,
    status: 'scheduled',
    scheduledAt: { $gt: now },
  }).sort({ scheduledAt: 1 });

  const reminders = [];

  for (const apt of upcoming) {
    const msUntil = new Date(apt.scheduledAt) - now;
    const hoursUntil = msUntil / (1000 * 60 * 60);

    if (hoursUntil <= 24 && !apt.reminder24hSent) {
      reminders.push({
        type: '24h',
        title: 'Appointment tomorrow',
        message: `Reminder: You have a ${apt.type} appointment with ${apt.doctorName} on ${apt.scheduledAt.toLocaleString()}.`,
        appointmentId: apt._id,
        scheduledAt: apt.scheduledAt,
      });
      apt.reminder24hSent = true;
      await apt.save();
      if (patient) {
        try { await sendAppointmentReminder(patient, apt, '24h'); } catch { /* ignore */ }
      }
    } else if (hoursUntil <= 1 && !apt.reminder1hSent) {
      reminders.push({
        type: '1h',
        title: 'Appointment in 1 hour',
        message: `Your appointment with ${apt.doctorName} starts at ${new Date(apt.scheduledAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}. Please be ready.`,
        appointmentId: apt._id,
        scheduledAt: apt.scheduledAt,
      });
      apt.reminder1hSent = true;
      await apt.save();
      if (patient) {
        try { await sendAppointmentReminder(patient, apt, '1h'); } catch { /* ignore */ }
      }
    }
  }

  return reminders;
}

module.exports = {
  DEPARTMENTS,
  listDoctors,
  getAvailability,
  bookAppointment,
  rescheduleAppointment,
  cancelAppointment,
  getPatientReminders,
  SLOT_MINUTES,
};
