const express = require('express');
const { z } = require('zod');
const autonomyState = require('../autonomyState');
const logger = require('../logger');

const router = express.Router();

router.get('/autonomy', async (req, res) => {
  try {
    res.json({ autonomousChaosPaused: await autonomyState.isPaused() });
  } catch (err) {
    logger.error({ err }, 'GET /autonomy failed');
    res.status(500).json({ error: 'failed to read autonomy state' });
  }
});

const autonomyBodySchema = z.object({ paused: z.boolean() });

// Pauses/resumes only the scheduled/autonomous trigger path — a manual
// "Break It" click from the dashboard still works while paused. Exists
// because the scheduled chaos job runs unattended every ~2h: if the
// system is stuck failing (e.g. Groq quota exhausted), autonomous chaos
// would otherwise keep piling up unresolved incidents until someone
// notices and fixes the underlying cause. This is a stopgap, not a fix.
router.post('/autonomy', async (req, res) => {
  const parsed = autonomyBodySchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'paused (boolean) is required' });
  }

  try {
    await autonomyState.setPaused(parsed.data.paused);
    res.json({ autonomousChaosPaused: parsed.data.paused });
  } catch (err) {
    logger.error({ err }, 'POST /autonomy failed');
    res.status(500).json({ error: 'failed to update autonomy state' });
  }
});

module.exports = router;
