const express = require('express');
const router = express.Router();
const Summary = require('../models/Summary');
const { protect } = require('../middleware/auth');

// @route   POST /api/summaries
// @desc    Create a summary entry
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const summary = await Summary.create(req.body);
    res.status(201).json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/summaries/workspace/:workspaceId/type/:type
// @desc    Get latest summary for a workspace by type (daily or weekly)
// @access  Private
router.get('/workspace/:workspaceId/type/:type/latest', protect, async (req, res) => {
  try {
    const { workspaceId, type } = req.params;
    const summary = await Summary.findOne({
      workspace_id: workspaceId,
      summary_type: type
    }).sort({ summary_date: -1 });
    
    if (!summary) return res.status(404).json({ error: 'Not found' });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/summaries/workspace/:workspaceId/range
// @desc    Get summaries by date range
// @access  Private
router.get('/workspace/:workspaceId/range', protect, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { start, end } = req.query;
    
    const summaries = await Summary.find({
      workspace_id: workspaceId,
      summary_date: { $gte: start, $lte: end }
    }).sort({ summary_date: -1 });
    
    res.json(summaries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/summaries/findOrCreate
// @desc    Helper to find an existing summary or return null so frontend can create
// @access  Private
router.get('/workspace/:workspaceId/type/:type/date/:date', protect, async (req, res) => {
  try {
    const { workspaceId, type, date } = req.params;
    const summary = await Summary.findOne({
      workspace_id: workspaceId,
      summary_type: type,
      summary_date: date
    });
    
    if (!summary) return res.status(404).json({ error: 'Not found' });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   PUT /api/summaries/:id
// @desc    Update a summary entry
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const summary = await Summary.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/summaries/workspace/:workspaceId/generate
// @desc    Generate (or regenerate) a summary from standup data for a given date & type
// @access  Private
router.post('/workspace/:workspaceId/generate', protect, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { type, date } = req.body;

    if (!type || !date) {
      return res.status(400).json({ error: 'type and date are required' });
    }

    const Standup = require('../models/Standup');

    let standups = [];

    if (type === 'daily') {
      standups = await Standup.find({ workspace_id: workspaceId, date })
        .populate('user_id', 'fullName email')
        .lean();
    } else if (type === 'weekly') {
      // date is Monday of the week; find all standups for the 7 days
      const start = date;
      const startMs = new Date(date).getTime();
      const endDate = new Date(startMs + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      standups = await Standup.find({
        workspace_id: workspaceId,
        date: { $gte: start, $lte: endDate }
      })
        .populate('user_id', 'fullName email')
        .lean();
    } else {
      return res.status(400).json({ error: 'type must be "daily" or "weekly"' });
    }

    if (standups.length === 0) {
      // Return a friendly 200 with a placeholder instead of 404
      // so the frontend can show a "no standups yet" state instead of crashing
      const placeholder = {
        workspace_id: workspaceId,
        summary_type: type,
        summary_date: date,
        generated_summary: type === 'daily'
          ? `No standups submitted today (${date}).`
          : `No standups submitted this week (week of ${date}).`,
        highlights: JSON.stringify([]),
        blockers_summary: JSON.stringify([]),
        createdAt: new Date().toISOString(),
        _id: 'placeholder-' + Date.now(),
      };
      return res.status(200).json(placeholder);
    }

    // --- Build the summary text ---
    const memberLines = standups.map(s => {
      const name = s.user_id?.fullName || s.user_id?.email || 'Unknown';
      return `• ${name}: ${s.what_worked}`;
    }).join('\n');

    const nextLines = standups.map(s => {
      const name = s.user_id?.fullName || s.user_id?.email || 'Unknown';
      return `• ${name}: ${s.what_next}`;
    }).join('\n');

    const label = type === 'daily' ? `Daily Summary — ${date}` : `Weekly Summary — Week of ${date}`;
    const generated_summary = `${label}\n\nWhat the team worked on:\n${memberLines}\n\nWhat comes next:\n${nextLines}`;

    // Blockers (only non-empty ones)
    const blockerItems = standups
      .filter(s => s.blockers && s.blockers.trim() !== '' && s.blockers.toLowerCase() !== 'none')
      .map(s => {
        const name = s.user_id?.fullName || s.user_id?.email || 'Unknown';
        return { area: name, issue: s.blockers };
      });

    const highlightItems = standups.map(s => {
      const name = s.user_id?.fullName || s.user_id?.email || 'Unknown';
      return `${name}: ${s.what_worked}`;
    });

    // Upsert: replace existing summary for same workspace+type+date, or create new
    const existing = await Summary.findOne({
      workspace_id: workspaceId,
      summary_type: type,
      summary_date: date
    });

    let saved;
    const payload = {
      workspace_id: workspaceId,
      summary_type: type,
      summary_date: date,
      generated_summary,
      highlights: JSON.stringify(highlightItems),
      blockers_summary: JSON.stringify(blockerItems),
    };

    if (existing) {
      saved = await Summary.findByIdAndUpdate(existing._id, payload, { new: true });
    } else {
      saved = await Summary.create(payload);
    }

    res.status(201).json(saved);
  } catch (err) {
    console.error('Summary Generate Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
