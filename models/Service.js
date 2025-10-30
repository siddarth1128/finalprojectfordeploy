const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  provider_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Provider',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: null
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  availability: {
    type: String,
    enum: ['available', 'unavailable'],
    default: 'available'
  }
}, {
  timestamps: true
});

// Indexes for faster queries
serviceSchema.index({ provider_id: 1 });
serviceSchema.index({ availability: 1 });

module.exports = mongoose.model('Service', serviceSchema);
