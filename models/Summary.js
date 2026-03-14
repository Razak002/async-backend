const mongoose = require('mongoose');

const SummarySchema = new mongoose.Schema(
  {
    workspace_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    summary_type: {
      type: String,
      enum: ['daily', 'weekly'],
      required: true,
    },
    summary_date: {
      type: String, // YYYY-MM-DD format
      required: true,
    },
    generated_summary: {
      type: String,
      required: true,
    },
    highlights: {
      type: String,
      default: '',
    },
    blockers_summary: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true, // manages generated_at (createdAt)
  }
);

module.exports = mongoose.model('Summary', SummarySchema);
