const express = require('express');
const { z } = require('zod');
const autonomyState = require('../autonomyState');
const logger = require('../logger');

const router = express.Router();

router.get('/autonomy', async (req, res) => {
  try {
    res.json({ chaosPaused: await autonomyState.isPaused() });
  } catch (err) {
    logger.error({ err }, 'GET /autonomy failed');
    res.status(500).json({ error: 'failed to read autonomy state' });
  }
});

const autonomyBodySchema = z.object({ paused: z.boolean() });

// Blocks every /break-it trigger — manual or autonomous. Originally
// this only paused the scheduled job (manual always went through), but
// /break-it is public and unauthenticated by design, so there's no way
// to tell a legitimate manual test apart from an outside script hitting
// the API directly. This is a blunt emergency stop for that case, not
// a fix for the underlying cause (e.g. a Groq outage) — it just stops
// new incidents from piling up while someone addresses that.
router.post('/autonomy', async (req, res) => {
  const parsed = autonomyBodySchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'paused (boolean) is required' });
  }

  try {
    await autonomyState.setPaused(parsed.data.paused);
    res.json({ chaosPaused: parsed.data.paused });
  } catch (err) {
    logger.error({ err }, 'POST /autonomy failed');
    res.status(500).json({ error: 'failed to update autonomy state' });
  }
});

module.exports = router;
