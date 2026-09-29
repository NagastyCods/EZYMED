const crypto = require('crypto');
const Patient = require('../models/Patient');
const { sendEmail } = require('./notificationService');
const { getAppUrl } = require('../config/app');
const logger = require('./logger');

const TOKEN_BYTES = 32;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

async function sendVerificationEmail(patient) {
  const token = generateToken();
  patient.emailVerificationToken = hashToken(token);
  patient.emailVerificationExpires = new Date(Date.now() + VERIFY_TTL_MS);
  await patient.save();

  const verifyUrl = `${getAppUrl()}/verify-email.html?token=${token}&email=${encodeURIComponent(patient.email)}`;

  await sendEmail({
    to: patient.email,
    subject: 'Verify your EZYMED account',
    text: `Hi ${patient.firstName},\n\nVerify your email: ${verifyUrl}\n\nThis link expires in 24 hours.`,
  });

  return { sent: true };
}

async function verifyEmail(email, token) {
  const patient = await Patient.findOne({ email: email.toLowerCase() }).select('+emailVerificationToken +emailVerificationExpires');
  if (!patient) throw new Error('Invalid verification link');

  if (!patient.emailVerificationToken || !patient.emailVerificationExpires) {
    throw new Error('No pending verification for this account');
  }

  if (patient.emailVerificationExpires < new Date()) {
    throw new Error('Verification link has expired');
  }

  if (patient.emailVerificationToken !== hashToken(token)) {
    throw new Error('Invalid verification link');
  }

  patient.emailVerified = true;
  patient.emailVerificationToken = undefined;
  patient.emailVerificationExpires = undefined;
  await patient.save();

  return patient;
}

async function resendVerificationEmail(email) {
  const patient = await Patient.findOne({ email: email.toLowerCase() }).select('+emailVerificationToken +emailVerificationExpires');
  if (!patient) return { sent: false };
  if (patient.emailVerified) throw new Error('Email is already verified');

  await sendVerificationEmail(patient);
  return { sent: true };
}

async function requestPasswordReset(email) {
  const patient = await Patient.findOne({ email: email.toLowerCase() });
  if (!patient) {
    return { sent: true };
  }

  const token = generateToken();
  patient.passwordResetToken = hashToken(token);
  patient.passwordResetExpires = new Date(Date.now() + RESET_TTL_MS);
  await patient.save();

  const resetUrl = `${getAppUrl()}/reset-password.html?token=${token}&email=${encodeURIComponent(patient.email)}`;

  await sendEmail({
    to: patient.email,
    subject: 'Reset your EZYMED password',
    text: `Hi ${patient.firstName},\n\nReset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`,
  });

  return { sent: true };
}

async function resetPassword(email, token, newPassword) {
  if (!newPassword || newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  const patient = await Patient.findOne({ email: email.toLowerCase() }).select('+password +passwordResetToken +passwordResetExpires');
  if (!patient || !patient.passwordResetToken || !patient.passwordResetExpires) {
    throw new Error('Invalid or expired reset link');
  }

  if (patient.passwordResetExpires < new Date()) {
    throw new Error('Reset link has expired');
  }

  if (patient.passwordResetToken !== hashToken(token)) {
    throw new Error('Invalid or expired reset link');
  }

  patient.password = newPassword;
  patient.passwordResetToken = undefined;
  patient.passwordResetExpires = undefined;
  await patient.save();

  logger.info({ patientId: patient._id.toString() }, 'Password reset completed');
  return patient;
}

module.exports = {
  hashToken,
  generateToken,
  sendVerificationEmail,
  verifyEmail,
  resendVerificationEmail,
  requestPasswordReset,
  resetPassword,
};
