const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const pharmacistAccountSchema = new mongoose.Schema({
  pharmacyId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false,
  },
  active: { type: Boolean, default: true },
  lastLoginAt: { type: Date },
  mfaEnabled: { type: Boolean, default: false },
  mfaSecret: { type: String, select: false },
}, { timestamps: true });

pharmacistAccountSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

pharmacistAccountSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('PharmacistAccount', pharmacistAccountSchema);
