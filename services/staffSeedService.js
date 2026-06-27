const { DOCTORS } = require('../config/doctors');
const DoctorAccount = require('../models/DoctorAccount');
const HospitalAdmin = require('../models/HospitalAdmin');

async function seedStaffAccounts() {
  const defaultDoctorPassword = process.env.DOCTOR_DEFAULT_PASSWORD || 'Doctor@123';
  const adminEmail = (process.env.HOSPITAL_ADMIN_EMAIL || 'admin@ezymed.com').toLowerCase();
  const adminPassword = process.env.HOSPITAL_ADMIN_PASSWORD || 'Admin@123';

  let seeded = 0;

  for (const doctor of DOCTORS) {
    const exists = await DoctorAccount.findOne({ doctorId: doctor.id });
    if (exists) continue;

    await DoctorAccount.create({
      doctorId: doctor.id,
      password: defaultDoctorPassword,
    });
    seeded += 1;
  }

  const adminExists = await HospitalAdmin.findOne({ email: adminEmail });
  if (!adminExists) {
    await HospitalAdmin.create({
      email: adminEmail,
      password: adminPassword,
      name: 'Hospital Administrator',
    });
    seeded += 1;
  }

  if (seeded > 0) {
    console.log(`Staff accounts seeded (${seeded} new account${seeded === 1 ? '' : 's'})`);
  }
}

module.exports = { seedStaffAccounts };
