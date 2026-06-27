const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const doctorAccountSchema = new mongoose.Schema({
  doctorId: {
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
}, { timestamps: true });

doctorAccountSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

doctorAccountSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('DoctorAccount', doctorAccountSchema);
