const mongoose = require('mongoose');

const WorkspaceMemberSchema = new mongoose.Schema(
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
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member',
      required: true,
    },
  },
  {
    timestamps: true, // Using timestamps for joined_at essentially
  }
);

module.exports = mongoose.model('WorkspaceMember', WorkspaceMemberSchema);
