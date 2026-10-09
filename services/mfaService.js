const jwt = require('jsonwebtoken');
const Patient = require('../models/Patient');
const DoctorAccount = require('../models/DoctorAccount');
const HospitalAdmin = require('../models/HospitalAdmin');
const PharmacistAccount = require('../models/PharmacistAccount');
const { logAudit } = require('./auditService');
const { getJwtSecret } = require('../config/secrets');

let otpPromise;

function loadOtp() {
  if (!otpPromise) otpPromise = import('otplib');
  return otpPromise;
}

function signMfaPendingToken({ role, id, name, extra = {} }) {
  return jwt.sign(
    { purpose: 'mfa_pending', role, id, name, ...extra },
    getJwtSecret(),
    { expiresIn: '5m' }
  );
}

function verifyMfaPendingToken(token) {
  const decoded = jwt.verify(token, getJwtSecret());
  if (decoded.purpose !== 'mfa_pending') throw new Error('Invalid MFA session');
  return decoded;
}

async function getAccountForRole(role, id) {
  if (role === 'patient') {
    return Patient.findById(id).select('+mfaSecret');
  }
  if (role === 'doctor') {
    return DoctorAccount.findOne({ doctorId: id, active: true }).select('+mfaSecret');
  }
  if (role === 'admin') {
    return HospitalAdmin.findById(id).select('+mfaSecret');
  }
  if (role === 'pharmacist') {
    return PharmacistAccount.findOne({ pharmacyId: id, active: true }).select('+mfaSecret');
  }
  throw new Error('Invalid role');
}

async function startMfaSetup(role, id, label) {
  const account = await getAccountForRole(role, id);
  if (!account) throw new Error('Account not found');

  const { generateSecret, generateURI } = await loadOtp();
  const secret = generateSecret();
  account.mfaSecret = secret;
  account.mfaEnabled = false;
  await account.save();

  const otpauth = generateURI({
    issuer: 'EZYMED',
    label,
    secret,
  });

  return { secret, otpauth };
}

async function confirmMfaSetup(role, id, code, req) {
  const account = await getAccountForRole(role, id);
  if (!account?.mfaSecret) throw new Error('MFA setup not started');

  const { verify } = await loadOtp();
  const result = await verify({ token: code, secret: account.mfaSecret });
  if (!result.valid) throw new Error('Invalid verification code');

  account.mfaEnabled = true;
  await account.save();

  await logAudit({
    actorRole: role,
    actorId: id.toString(),
    action: 'mfa.enabled',
    resourceType: 'account',
    resourceId: id.toString(),
    req,
  });

  return { mfaEnabled: true };
}

async function disableMfa(role, id, code, req) {
  const account = await getAccountForRole(role, id);
  if (!account?.mfaEnabled) throw new Error('MFA is not enabled');

  const { verify } = await loadOtp();
  const result = await verify({ token: code, secret: account.mfaSecret });
  if (!result.valid) throw new Error('Invalid verification code');

  account.mfaEnabled = false;
  account.mfaSecret = undefined;
  await account.save();

  await logAudit({
    actorRole: role,
    actorId: id.toString(),
    action: 'mfa.disabled',
    resourceType: 'account',
    resourceId: id.toString(),
    req,
  });

  return { mfaEnabled: false };
}

async function verifyMfaLogin(mfaToken, code, req) {
  const pending = verifyMfaPendingToken(mfaToken);
  const account = await getAccountForRole(pending.role, pending.id);
  if (!account?.mfaEnabled || !account.mfaSecret) {
    throw new Error('MFA is not configured for this account');
  }

  const { verify } = await loadOtp();
  const result = await verify({ token: code, secret: account.mfaSecret });
  if (!result.valid) {
    await logAudit({
      actorRole: pending.role,
      actorId: pending.id.toString(),
      action: 'mfa.login_failed',
      outcome: 'failure',
      req,
    });
    throw new Error('Invalid verification code');
  }

  await logAudit({
    actorRole: pending.role,
    actorId: pending.id.toString(),
    action: 'mfa.login_success',
    req,
  });

  return pending;
}

function accountRequiresMfa(account) {
  return Boolean(account?.mfaEnabled);
}

async function getMfaStatus(role, id) {
  const account = await getAccountForRole(role, id);
  return { mfaEnabled: Boolean(account?.mfaEnabled) };
}

module.exports = {
  signMfaPendingToken,
  verifyMfaPendingToken,
  startMfaSetup,
  confirmMfaSetup,
  disableMfa,
  verifyMfaLogin,
  accountRequiresMfa,
  getMfaStatus,
  getAccountForRole,
};
