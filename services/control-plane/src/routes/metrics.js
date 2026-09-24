const express = require('express');
const { buildMetricsText } = require('../metrics');

const router = express.Router();

// Prometheus-scrapeable text exposition — plain read-only aggregation
// over the same services/incidents data everything else here uses.
router.get('/metrics', async (req, res) => {
  try {
    const text = await buildMetricsText();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(text);
  } catch (err) {
    console.error('[metrics] GET /metrics failed:', err.message);
    res.status(500).json({ error: 'failed to build metrics' });
  }
});

module.exports = router;
