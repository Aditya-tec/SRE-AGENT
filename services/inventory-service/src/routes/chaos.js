const express = require('express');
const { applyChaos, getStatus } = require('../chaosState');

const router = express.Router();
const VALID_TYPES = ['latency', 'error_rate', 'crash'];

router.post('/chaos', (req, res) => {
  const { type, durationSec, severity } = req.body || {};

  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of ${VALID_TYPES.join(', ')}` });
  }

  const duration = Number.isInteger(durationSec) && durationSec > 0 ? durationSec : 30;
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
