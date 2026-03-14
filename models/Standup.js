const mongoose = require('mongoose');

const StandupSchema = new mongoose.Schema(
  {
    workspace_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      type: String, // YYYY-MM-DD format
      required: true,
    },
    what_worked: {
      type: String,
      required: true,
    },
    what_next: {
      type: String,
      required: true,
    },
    blockers: {
      type: String,
      default: '',
    },
    submission_method: {
      type: String,
      enum: ['dashboard', 'slack', 'voice'],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Standup', StandupSchema);
