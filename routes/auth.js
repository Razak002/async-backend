const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');


const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d', // Token valid for 30 days
  });
};


// @route   POST /api/auth/register
// @desc    Register a a new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Please include all required fields' });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create the user in MongoDB
    const user = await User.create({
      email,
      password: hashedPassword,
      fullName
    });

    if (user) {
      // Process pending invites
      const WorkspaceInvite = require('../models/WorkspaceInvite');
      const WorkspaceMember = require('../models/WorkspaceMember');

      const pendingInvites = await WorkspaceInvite.find({ email: user.email });
      
      if (pendingInvites.length > 0) {
        const memberDocs = pendingInvites.map(invite => ({
          workspace_id: invite.workspace_id,
          user_id: user._id,
          role: invite.role,
        }));

        await WorkspaceMember.insertMany(memberDocs);
        await WorkspaceInvite.deleteMany({ email: user.email });
      }

      res.status(201).json({
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ error: 'Invalid user data' });
    }
  } catch (error) {
    console.error('Registration Error:', error.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate a user & get token
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find the user by email
    const user = await User.findOne({ email });

    // Verify user exists and password matches
    if (user && (await bcrypt.compare(password, user.password))) {
      res.json({
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/auth/me
// @desc    Get the currently logged in user profile
// @access  Private (requires token)
router.get('/me', protect, async (req, res) => {
  try {
    // Find user by ID stored in the token (done by the protect middleware)
    const user = await User.findById(req.user.id).select('-password'); // Exclude the password field!
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json(user);
  } catch (error) {
    res.status(500).send('Server Error');
  }
});

module.exports = router;
