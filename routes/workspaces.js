const express = require('express');
const router = express.Router();
const Workspace = require('../models/Workspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const { protect } = require('../middleware/auth');

// @route   POST /api/workspaces
// @desc    Create a new workspace
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { name, slug } = req.body;
    const userId = req.user.id;

    // Create workspace
    const workspace = await Workspace.create({
      name,
      slug: slug.toLowerCase(),
      created_by: userId
    });

    // Add creator as admin
    await WorkspaceMember.create({
      workspace_id: workspace._id,
      user_id: userId,
      role: 'admin'
    });

    res.status(201).json(workspace);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Slug already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/workspaces
// @desc    Get all workspaces for current user
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const members = await WorkspaceMember.find({ user_id: req.user.id })
      .populate('workspace_id');
    
    // Map to a format similar to Supabase response
    const workspaces = members
      .filter(m => m.workspace_id)
      .map(m => {
        const ws = m.workspace_id.toObject();
        ws.workspace_members = [{ user_id: req.user.id, role: m.role }];
        return ws;
      });

    res.json(workspaces);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/workspaces/:slug (by slug)
// @desc    Get workspace by slug
// @access  Private
router.get('/slug/:slug', protect, async (req, res) => {
  try {
    const workspace = await Workspace.findOne({ slug: req.params.slug });
    if (!workspace) return res.status(404).json({ error: 'Not found' });
    res.json(workspace);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/workspaces/:id
// @desc    Get workspace by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ error: 'Not found' });
    res.json(workspace);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   PUT /api/workspaces/:id
// @desc    Update workspace details
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const { name, slug } = req.body;
    
    // Check if user is admin
    const member = await WorkspaceMember.findOne({
      workspace_id: req.params.id,
      user_id: req.user.id,
      role: 'admin'
    });
    
    if (!member) return res.status(403).json({ error: 'Not authorized' });

    const workspace = await Workspace.findByIdAndUpdate(
      req.params.id,
      { $set: { name, slug: slug?.toLowerCase() } },
      { new: true, runValidators: true }
    );

    res.json(workspace);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Slug already exists' });
    res.status(500).json({ error: err.message });
  }
});

// @route   DELETE /api/workspaces/:id
// @desc    Delete a workspace
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
     // Check if user is admin
     const member = await WorkspaceMember.findOne({
      workspace_id: req.params.id,
      user_id: req.user.id,
      role: 'admin'
    });
    
    if (!member) return res.status(403).json({ error: 'Not authorized' });

    // Delete all members
    await WorkspaceMember.deleteMany({ workspace_id: req.params.id });
    
    // Delete the workspace
    await Workspace.findByIdAndDelete(req.params.id);

    res.json({ message: 'Workspace deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/workspaces/:id/members
// @desc    Add member to workspace
// @access  Private
router.post('/:id/members', protect, async (req, res) => {
  try {
    const { user_id, role } = req.body;
    const member = await WorkspaceMember.create({
      workspace_id: req.params.id,
      user_id: user_id,
      role: role || 'member'
    });
    res.status(201).json(member);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const User = require('../models/User');

const WorkspaceInvite = require('../models/WorkspaceInvite');

// @route   POST /api/workspaces/:id/invite
// @desc    Invite a member to a workspace by email
// @access  Private
router.post('/:id/invite', protect, async (req, res) => {
  try {
    // Check if current user is admin
    const adminCheck = await WorkspaceMember.findOne({
        workspace_id: req.params.id,
        user_id: req.user.id,
        role: 'admin'
    });
    if (!adminCheck) return res.status(403).json({ error: 'Not authorized' });

    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const normalizedEmail = email.toLowerCase();

    // Find the user by email
    const userToInvite = await User.findOne({ email: normalizedEmail });
    
    if (!userToInvite) {
      // User doesn't exist yet, so we create a pending invite
      const existingInvite = await WorkspaceInvite.findOne({
        workspace_id: req.params.id,
        email: normalizedEmail
      });

      if (existingInvite) {
        return res.status(400).json({ error: 'An invitation has already been sent to this email address.' });
      }

      const newInvite = await WorkspaceInvite.create({
        workspace_id: req.params.id,
        email: normalizedEmail,
        role: role || 'member',
        invited_by: req.user.id
      });

      // We still return 201 so the frontend knows it was successful
      return res.status(201).json({
        _id: newInvite._id,
        role: newInvite.role,
        user: { email: newInvite.email, full_name: 'Pending Invite', is_pending: true }
      });
    }

    // Check if they are already in the workspace
    const existingMember = await WorkspaceMember.findOne({
      workspace_id: req.params.id,
      user_id: userToInvite._id
    });

    if (existingMember) {
      return res.status(400).json({ error: 'User is already a member of this workspace' });
    }

    const member = await WorkspaceMember.create({
      workspace_id: req.params.id,
      user_id: userToInvite._id,
      role: role || 'member'
    });

    // We can populate so the frontend has the data ready to display
    const populatedMember = await WorkspaceMember.findById(member._id).populate('user_id', 'fullName email');
    
    const formattedMember = {
        _id: populatedMember._id,
        role: populatedMember.role,
        user: populatedMember.user_id ? {
          id: populatedMember.user_id._id,
          full_name: populatedMember.user_id.fullName,
          email: populatedMember.user_id.email
        } : null
    };

    res.status(201).json(formattedMember);
  } catch (err) {
     res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/workspaces/:id/members/all
// @desc    Get all members of a workspace
// @access  Private
router.get('/:id/members/all', protect, async (req, res) => {
  try {
    // Basic authorization: Verify the requesting user is in the workspace
    const checkAccess = await WorkspaceMember.findOne({
      workspace_id: req.params.id,
      user_id: req.user.id
    });
    
    if (!checkAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const members = await WorkspaceMember.find({ workspace_id: req.params.id })
      .populate('user_id', 'fullName email')
      .lean();
      
    // Format response
    const formattedMembers = members.map(m => ({
      _id: m._id,
      role: m.role,
      user: m.user_id ? {
        id: m.user_id._id,
        full_name: m.user_id.fullName,
        email: m.user_id.email
      } : null
    }));

    const invites = await WorkspaceInvite.find({ workspace_id: req.params.id }).lean();
    const formattedInvites = invites.map(i => ({
      _id: i._id,
      role: i.role,
      user: {
        email: i.email,
        full_name: 'Pending Invite',
        is_pending: true
      }
    }));

    res.json([...formattedMembers, ...formattedInvites]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/workspaces/:id/access
// @desc    Check access for user
// @access  Private
router.get('/:id/access', protect, async (req, res) => {
  try {
    // Check if the current user has access, or you can pass user_id in query if admin checking
    const targetUserId = req.query.user_id || req.user.id;
    const member = await WorkspaceMember.findOne({
      workspace_id: req.params.id,
      user_id: targetUserId
    });
    if (!member) return res.status(404).json({ access: false });
    res.json(member);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
