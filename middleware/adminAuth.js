const jwt = require('jsonwebtoken');
const HospitalAdmin = require('../models/HospitalAdmin');

const JWT_SECRET = process.env.JWT_SECRET || 'ezymed-dev-secret-change-in-production';

const signAdminToken = (admin) =>
  jwt.sign(
    { id: admin.id, role: 'admin', email: admin.email, name: admin.name },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

async function authenticateAdmin(email, password) {
  const admin = await HospitalAdmin.findOne({
    email: email.toLowerCase(),
    active: true,
  }).select('+password');

  if (!admin) {
    throw new Error('Invalid administrator credentials');
  }

  const valid = await admin.comparePassword(password);
  if (!valid) {
    throw new Error('Invalid administrator credentials');
  }

  admin.lastLoginAt = new Date();
  await admin.save();

  const publicAdmin = {
    id: admin._id.toString(),
    email: admin.email,
    name: admin.name,
  };

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
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired administrator token' });
  }
};

module.exports = { authenticateAdmin, adminAuth };
