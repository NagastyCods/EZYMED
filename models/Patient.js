const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const emergencyContactSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  relationship: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
}, { _id: true });

const allergySchema = new mongoose.Schema({
  allergen: { type: String, required: true, trim: true },
  severity: { type: String, enum: ['mild', 'moderate', 'severe'], default: 'moderate' },
  reaction: { type: String, trim: true },
}, { _id: true });

const medicationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  dosage: { type: String, trim: true },
  frequency: { type: String, trim: true },
  prescribedBy: { type: String, trim: true },
  startDate: { type: Date },
}, { _id: true });

const medicalHistorySchema = new mongoose.Schema({
  condition: { type: String, required: true, trim: true },
  diagnosedDate: { type: Date },
  status: { type: String, enum: ['active', 'resolved', 'managed'], default: 'active' },
  notes: { type: String, trim: true },
}, { _id: true });

const insuranceSchema = new mongoose.Schema({
  provider: { type: String, trim: true },
  policyNumber: { type: String, trim: true },
  groupNumber: { type: String, trim: true },
  planType: { type: String, trim: true },
  expiryDate: { type: Date },
}, { _id: false });

const patientSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false,
  },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  dateOfBirth: { type: Date },
  gender: { type: String, enum: ['male', 'female', 'other', 'prefer-not-to-say', ''], default: '' },
  bloodType: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown', ''], default: 'unknown' },
  address: {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zipCode: { type: String, trim: true },
    country: { type: String, trim: true, default: 'Nigeria' },
  },
  insurance: insuranceSchema,
  emergencyContacts: [emergencyContactSchema],
  allergies: [allergySchema],
  medications: [medicationSchema],
  medicalHistory: [medicalHistorySchema],
}, { timestamps: true });

patientSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

patientSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

patientSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

patientSchema.methods.toPublicJSON = function () {
  const obj = this.toObject({ virtuals: true });
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('Patient', patientSchema);
