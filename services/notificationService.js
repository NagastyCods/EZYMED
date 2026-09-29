const nodemailer = require('nodemailer');
const logger = require('./logger');
const { getAppUrl } = require('../config/app');

let transporter;

function getTransporter() {
  if (transporter !== undefined) return transporter;

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  } else {
    transporter = null;
  }

  return transporter;
}

async function sendEmail({ to, subject, text, html }) {
  if (!to) throw new Error('Email recipient is required');

  const from = process.env.EMAIL_FROM;
  const mail = { from, to, subject, text, html: html || text };

  const transport = getTransporter();
  if (transport) {
    await transport.sendMail(mail);
    logger.info({ to, subject, provider: 'smtp' }, 'Email sent');
    return { sent: true, provider: 'smtp' };
  }

  logger.info({ to, subject, text: text?.slice(0, 200) }, 'Email logged (SMTP not configured)');
  return { sent: true, provider: 'console' };
}

async function sendSms({ to, message }) {
  if (!to || !message) return { sent: false, provider: 'none' };

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) {
    logger.warn('Twilio env vars set but SDK not wired — log SMS only');
  }

  logger.info({ to, message: message.slice(0, 160) }, 'SMS logged (SMS provider not configured)');
  return { sent: true, provider: 'console' };
}

async function notifyPatientByEmail(patient, { subject, text }) {
  if (!patient?.email) return { sent: false, reason: 'no_email' };
  return sendEmail({ to: patient.email, subject, text });
}

async function notifyPatientBySms(patient, message) {
  if (!patient?.phone) return { sent: false, reason: 'no_phone' };
  return sendSms({ to: patient.phone, message });
}

async function sendAppointmentConfirmation(patient, appointment) {
  const when = new Date(appointment.scheduledAt).toLocaleString();
  return notifyPatientByEmail(patient, {
    subject: 'EZYMED appointment confirmed',
    text: `Hi ${patient.firstName},\n\nYour ${appointment.type} appointment with ${appointment.doctorName} is scheduled for ${when}.\n\nManage appointments: ${getAppUrl()}/dashboard.html`,
  });
}

async function sendAppointmentReminder(patient, appointment, reminderType) {
  const when = new Date(appointment.scheduledAt).toLocaleString();
  const subject = reminderType === '1h'
    ? 'EZYMED appointment in 1 hour'
    : 'EZYMED appointment reminder';
  return notifyPatientByEmail(patient, {
    subject,
    text: `Hi ${patient.firstName},\n\nReminder: your appointment with ${appointment.doctorName} is on ${when}.\n\nPortal: ${getAppUrl()}/dashboard.html`,
  });
}

async function sendPharmacyNotification(patient, message) {
  return notifyPatientByEmail(patient, {
    subject: 'EZYMED pharmacy update',
    text: `Hi ${patient.firstName},\n\n${message}\n\nView orders: ${getAppUrl()}/dashboard.html`,
  });
}

module.exports = {
  sendEmail,
  sendSms,
  notifyPatientByEmail,
  notifyPatientBySms,
  sendAppointmentConfirmation,
  sendAppointmentReminder,
  sendPharmacyNotification,
};
