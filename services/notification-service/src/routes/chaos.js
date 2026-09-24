const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { applyChaos, getStatus } = require('../chaosState');

const router = express.Router();

const chaosBodySchema = z.object({
  type: z.enum(['latency', 'error_rate', 'crash']),
  durationSec: z.number().int().positive().max(300).optional(),
  severity: z.string().optional(),
});

// If CHAOS_SECRET is set, only callers presenting it (the control
// plane) can inject faults — closes the "anyone can crash the public
// demo forever" hole. Left unset, the endpoint stays open, matching
// local dev / the original "obscure but not really secret" design.
// Comparison is constant-time: a plain === leaks how many leading
// bytes matched through response timing, letting a secret this short
// be brute-forced character by character.
function isAuthorized(req) {
  const secret = process.env.CHAOS_SECRET;
  if (!secret) return true;
  const provided = req.get('x-chaos-secret') || '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post('/chaos', (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const parsed = chaosBodySchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: `type must be one of latency, error_rate, crash` });
  }

  const { type, durationSec, severity } = parsed.data;
  const duration = durationSec ?? 30;
  const result = applyChaos(type, duration, severity);

  res.json({ applied: true, type, expiresAt: result.expiresAt });

  if (type === 'crash') {
    setTimeout(() => process.exit(1), 500);
  }
});

router.get('/chaos/status', (req, res) => {
  res.json(getStatus());
});

module.exports = router;
