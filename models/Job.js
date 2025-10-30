const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  provider_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Provider',
    required: true
  },
  customer_name: {
    type: String,
    required: true,
    trim: true
  },
  service_type: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'in progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  amount: {
    type: Number,
    default: null,
    min: 0
  },
  date: {
    type: Date,
    default: null
  },
  time: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for faster queries
jobSchema.index({ provider_id: 1 });
jobSchema.index({ status: 1 });
jobSchema.index({ date: 1 });

module.exports = mongoose.model('Job', jobSchema);
