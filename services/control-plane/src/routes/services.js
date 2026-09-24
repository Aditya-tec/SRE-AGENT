const express = require('express');
const db = require('../db');
const logger = require('../logger');

const router = express.Router();

router.get('/services', async (req, res) => {
  try {
    const services = await db.listServices();
    res.json(
      services.map((s) => ({
        name: s.name,
        status: s.status,
        lastSeenAt: s.last_seen_at,
        lastLatencyMs: s.last_latency_ms,
        lastErrorRate: s.last_error_rate,
      }))
    );
  } catch (err) {
    logger.error({ err }, 'GET /services failed');
    res.status(500).json({ error: 'failed to list services' });
  }
});

module.exports = router;
