const jwt = require('jsonwebtoken');
const HospitalAdmin = require('../models/HospitalAdmin');
const { accountRequiresMfa, signMfaPendingToken } = require('../services/mfaService');
const { logAudit } = require('../services/auditService');

const JWT_SECRET = process.env.JWT_SECRET || 'ezymed-dev-secret-change-in-production';

const signAdminToken = (admin) =>
  jwt.sign(
    { id: admin.id, role: 'admin', email: admin.email, name: admin.name },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

async function authenticateAdmin(email, password, req) {
  const admin = await HospitalAdmin.findOne({
    email: email.toLowerCase(),
    active: true,
  }).select('+password +mfaSecret');

  if (!admin) {
    throw new Error('Invalid administrator credentials');
  }

  const valid = await admin.comparePassword(password);
  if (!valid) {
    await logAudit({
      actorRole: 'admin',
      actorId: admin._id.toString(),
      actorName: admin.email,
      action: 'auth.login_failed',
      outcome: 'failure',
      req,
    });
    throw new Error('Invalid administrator credentials');
  }

  admin.lastLoginAt = new Date();
  await admin.save();

  const publicAdmin = {
    id: admin._id.toString(),
    email: admin.email,
    name: admin.name,
  };

  if (accountRequiresMfa(admin)) {
    return {
      requiresMfa: true,
      mfaToken: signMfaPendingToken({
        role: 'admin',
        id: publicAdmin.id,
        name: publicAdmin.name,
        email: publicAdmin.email,
      }),
      admin: publicAdmin,
    };
  }

  await logAudit({
    actorRole: 'admin',
    actorId: publicAdmin.id,
    actorName: publicAdmin.name,
    action: 'auth.login',
    req,
  });

  return {
    admin: publicAdmin,
    token: signAdminToken(publicAdmin),
  };
}

const adminAuth = (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Administrator authentication required' });
    }

    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Administrator access only' });
    }

    req.admin = decoded;
    req.userRole = 'admin';
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired administrator token' });
  }
};

module.exports = { authenticateAdmin, adminAuth, signAdminToken };
