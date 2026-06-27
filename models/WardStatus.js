const mongoose = require('mongoose');

const wardStatusSchema = new mongoose.Schema({
  wardId: { type: String, required: true, unique: true },
  occupiedBeds: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

module.exports = mongoose.model('WardStatus', wardStatusSchema);
