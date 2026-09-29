const { DOCTORS } = require('../config/doctors');
const { PHARMACIES } = require('../config/pharmacies');
const DoctorAccount = require('../models/DoctorAccount');
const HospitalAdmin = require('../models/HospitalAdmin');
const PharmacistAccount = require('../models/PharmacistAccount');
const logger = require('./logger');

async function seedStaffAccounts() {
  const defaultDoctorPassword = process.env.DOCTOR_DEFAULT_PASSWORD ;
  const defaultPharmacyPassword = process.env.PHARMACY_DEFAULT_PASSWORD;
  const adminEmail = process.env.HOSPITAL_ADMIN_EMAIL
  const adminPassword = process.env.HOSPITAL_ADMIN_PASSWORD;

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

  for (const pharmacy of PHARMACIES) {
    const exists = await PharmacistAccount.findOne({ pharmacyId: pharmacy.id });
    if (exists) continue;

    await PharmacistAccount.create({
      pharmacyId: pharmacy.id,
      password: defaultPharmacyPassword,
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
    logger.info({ seeded }, 'Staff accounts seeded');
  }
}

module.exports = { seedStaffAccounts };
