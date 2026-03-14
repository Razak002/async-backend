const mongoose = require('mongoose');

const WorkspaceInviteSchema = new mongoose.Schema(
  {
    workspace_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member',
    },
    invited_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure a user is only invited once per workspace
WorkspaceInviteSchema.index({ workspace_id: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('WorkspaceInvite', WorkspaceInviteSchema);
