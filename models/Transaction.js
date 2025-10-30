const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  provider_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Provider',
    required: true
  },
  service: {
    type: String,
    required: true,
    trim: true
  },
  customer_name: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  date: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

// Indexes for faster queries
transactionSchema.index({ provider_id: 1 });
transactionSchema.index({ date: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
