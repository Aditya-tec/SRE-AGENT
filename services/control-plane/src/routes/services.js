const express = require('express');
const db = require('../db');

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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
