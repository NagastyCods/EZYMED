const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const hospitalAdminSchema = new mongoose.Schema({
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
  name: { type: String, trim: true, default: 'Hospital Administrator' },
  active: { type: Boolean, default: true },
  lastLoginAt: { type: Date },
}, { timestamps: true });

hospitalAdminSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

hospitalAdminSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('HospitalAdmin', hospitalAdminSchema);
