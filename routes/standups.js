const express = require('express');
const router = express.Router();
const Standup = require('../models/Standup');
const { protect } = require('../middleware/auth');

// @route   POST /api/standups
// @desc    Create a standup entry
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const standup = await Standup.create({
      ...req.body,
      user_id: req.user.id
    });
    res.status(201).json(standup);
  } catch (err) {
    console.error('Standup Creation Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/standups/me
// @desc    Get the authenticated user's personal standup history with streak data
// @access  Private
// @query   workspaceId (required), limit (default 30), offset (default 0)
router.get('/me', protect, async (req, res) => {
  try {
    const { workspaceId, limit = 30, offset = 0 } = req.query;

    const filter = { user_id: req.user.id };
    if (workspaceId) filter.workspace_id = workspaceId;

    const [standups, total] = await Promise.all([
      Standup.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip(Number(offset))
        .limit(Number(limit))
        .lean(),
      Standup.countDocuments(filter)
    ]);

    // --- Streak calculation ---
    // Get all distinct submission dates sorted descending
    const allDates = await Standup.distinct('date', { user_id: req.user.id, ...(workspaceId ? { workspace_id: workspaceId } : {}) });
    const sortedDates = allDates.sort((a, b) => new Date(b) - new Date(a));

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let prevDate = null;

    for (const dateStr of sortedDates) {
      const date = new Date(dateStr);
      if (!prevDate) {
        // Check if today or yesterday (allow 1-day grace)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffFromToday = Math.floor((today - date) / 86400000);
        if (diffFromToday <= 1) {
          tempStreak = 1;
          currentStreak = 1;
        } else {
          // Streak is broken from today
          tempStreak = 1;
        }
      } else {
        const diff = Math.floor((prevDate - date) / 86400000);
        if (diff === 1) {
          tempStreak++;
          if (prevDate && currentStreak > 0) currentStreak = tempStreak;
        } else {
          if (tempStreak > longestStreak) longestStreak = tempStreak;
          tempStreak = 1;
          if (currentStreak === 0) currentStreak = 0; // already broken
        }
      }
      if (tempStreak > longestStreak) longestStreak = tempStreak;
      prevDate = date;
    }

    // --- Submissions per week (last 8 weeks) ---
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
    const eightWeeksAgoStr = eightWeeksAgo.toISOString().split('T')[0];

    const recentStandups = await Standup.find({
      user_id: req.user.id,
      ...(workspaceId ? { workspace_id: workspaceId } : {}),
      date: { $gte: eightWeeksAgoStr }
    }).select('date').lean();

    // Group by ISO week
    const weekMap = {};
    for (const s of recentStandups) {
      const d = new Date(s.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay()); // Sunday
      const key = weekStart.toISOString().split('T')[0];
      weekMap[key] = (weekMap[key] || 0) + 1;
    }
    const weeklyActivity = Object.entries(weekMap)
      .map(([week, count]) => ({ week, count }))
      .sort((a, b) => a.week.localeCompare(b.week));

    res.json({
      standups,
      total,
      streak: {
        current: currentStreak,
        longest: longestStreak,
        totalSubmissions: total,
      },
      weeklyActivity,
    });
  } catch (err) {
    console.error('[Standups] /me error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/standups/workspace/:workspaceId/date/:date
// @desc    Get standups for a workspace by date
// @access  Private
router.get('/workspace/:workspaceId/date/:date', protect, async (req, res) => {
  try {
    const { workspaceId, date } = req.params;
    const standups = await Standup.find({ workspace_id: workspaceId, date })
      .populate('user_id', 'fullName email')
      .sort({ createdAt: -1 })
      .lean();

    const formatted = standups.map(s => ({
      ...s,
      user: s.user_id ? { full_name: s.user_id.fullName, email: s.user_id.email } : null
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/standups/workspace/:workspaceId/range
// @desc    Get standups for a workspace by date range (?start=YYYY-MM-DD&end=YYYY-MM-DD)
// @access  Private
router.get('/workspace/:workspaceId/range', protect, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { start, end } = req.query;

    const standups = await Standup.find({
      workspace_id: workspaceId,
      date: { $gte: start, $lte: end }
    })
      .populate('user_id', 'fullName email')
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const formatted = standups.map(s => ({
      ...s,
      user: s.user_id ? { full_name: s.user_id.fullName, email: s.user_id.email } : null
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/standups/workspace/:workspaceId/stats
// @desc    Submission stats per member for a workspace (last N days, default 30)
// @access  Private
// @query   days (default 30)
router.get('/workspace/:workspaceId/stats', protect, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const days = parseInt(req.query.days) || 30;

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    // Aggregate: count per user, total days, submission rate
    const agg = await Standup.aggregate([
      {
        $match: {
          workspace_id: require('mongoose').Types.ObjectId(workspaceId),
          date: { $gte: sinceStr }
        }
      },
      {
        $group: {
          _id: '$user_id',
          submissionCount: { $sum: 1 },
          latestDate: { $max: '$date' },
          earliestDate: { $min: '$date' },
          blockersCount: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$blockers', ''] }, { $ne: ['$blockers', null] }] },
                1, 0
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmpty: true } },
      {
        $project: {
          userId: '$_id',
          fullName: '$user.fullName',
          email: '$user.email',
          submissionCount: 1,
          submissionRate: {
            $round: [{ $multiply: [{ $divide: ['$submissionCount', days] }, 100] }, 1]
          },
          blockersCount: 1,
          latestDate: 1,
          earliestDate: 1,
        }
      },
      { $sort: { submissionCount: -1 } }
    ]);

    res.json({ days, stats: agg });
  } catch (err) {
    console.error('[Standups] /stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/standups/workspace/:workspaceId/blockers
// @desc    Get standup entries with non-empty blockers (blocker history)
// @access  Private
// @query   limit (default 20), start, end
router.get('/workspace/:workspaceId/blockers', protect, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { limit = 20, start, end } = req.query;

    const filter = {
      workspace_id: workspaceId,
      blockers: { $ne: '', $exists: true, $nin: [null, ''] }
    };
    if (start && end) filter.date = { $gte: start, $lte: end };

    const blockers = await Standup.find(filter)
      .populate('user_id', 'fullName email')
      .sort({ date: -1, createdAt: -1 })
      .limit(Number(limit))
      .lean();

    const formatted = blockers.map(s => ({
      _id: s._id,
      date: s.date,
      blocker: s.blockers,
      user: s.user_id ? { full_name: s.user_id.fullName, email: s.user_id.email } : null,
      what_next: s.what_next,
    }));

    res.json({ total: formatted.length, blockers: formatted });
  } catch (err) {
    console.error('[Standups] /blockers error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/standups/:id
// @desc    Get standup by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const standup = await Standup.findById(req.params.id);
    if (!standup) return res.status(404).json({ error: 'Not found' });
    res.json(standup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

