const express = require('express');
const crypto = require('crypto');
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

// If ADMIN_SECRET is set, only callers presenting it can pause/resume
// chaos — otherwise this control is exactly as public and
// unauthenticated as /break-it itself, meaning whoever is hammering
// the public API could just un-pause it the moment it's used against
// them. Left unset, stays open, matching CHAOS_SECRET's own local-dev
// precedent. Comparison is constant-time: a plain === leaks how many
// leading bytes matched through response timing.
function isAuthorized(req) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return true;
  const provided = req.get('x-admin-secret') || '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Blocks every /break-it trigger — manual or autonomous. Originally
// this only paused the scheduled job (manual always went through), but
// /break-it is public and unauthenticated by design, so there's no way
// to tell a legitimate manual test apart from an outside script hitting
// the API directly. This is a blunt emergency stop for that case, not
// a fix for the underlying cause (e.g. a Groq outage) — it just stops
// new incidents from piling up while someone addresses that.
router.post('/autonomy', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

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
