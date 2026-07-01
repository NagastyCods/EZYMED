const jwt = require('jsonwebtoken');
const Patient = require('../models/Patient');

const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'ezymed-dev-secret-change-in-production');

    const patient = await Patient.findById(decoded.id);
    if (!patient) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.patient = patient;
    req.patientId = patient._id;
    req.userRole = 'patient';
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = auth;
