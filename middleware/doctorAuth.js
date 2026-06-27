const jwt = require('jsonwebtoken');
const { findDoctorById, DOCTORS } = require('../config/doctors');
const DoctorAccount = require('../models/DoctorAccount');

const JWT_SECRET = process.env.JWT_SECRET || 'ezymed-dev-secret-change-in-production';

const signDoctorToken = (doctor) =>
  jwt.sign(
    { id: doctor.id, role: 'doctor', name: doctor.name, department: doctor.department },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

async function authenticateDoctor(doctorId, password) {
  const doctor = findDoctorById(doctorId);
  if (!doctor) {
    throw new Error('Invalid doctor credentials');
  }

  const account = await DoctorAccount.findOne({ doctorId: doctor.id, active: true }).select('+password');
  if (!account) {
    throw new Error('Invalid doctor credentials');
  }

  const valid = await account.comparePassword(password);
  if (!valid) {
    throw new Error('Invalid doctor credentials');
  }

  account.lastLoginAt = new Date();
  await account.save();

  return { doctor, token: signDoctorToken(doctor) };
}

const doctorAuth = (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Doctor authentication required' });
    }

    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
    if (decoded.role !== 'doctor') {
      return res.status(403).json({ message: 'Doctor access only' });
    }

    const doctor = findDoctorById(decoded.id);
    if (!doctor) {
      return res.status(401).json({ message: 'Invalid doctor token' });
    }

    req.doctor = doctor;
    req.doctorId = doctor.id;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired doctor token' });
  }
};

function verifySocketToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.role === 'doctor') {
    const doctor = findDoctorById(decoded.id);
    if (!doctor) throw new Error('Invalid doctor');
    return { role: 'doctor', id: doctor.id, name: doctor.name };
  }

  return { role: 'patient', id: decoded.id, name: decoded.name || 'Patient' };
}

module.exports = {
  DOCTORS,
  authenticateDoctor,
  doctorAuth,
  verifySocketToken,
  signDoctorToken,
};
