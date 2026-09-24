const express = require('express');
const { buildMetricsText } = require('../metrics');
const logger = require('../logger');

const router = express.Router();

// Prometheus-scrapeable text exposition — plain read-only aggregation
// over the same services/incidents data everything else here uses.
router.get('/metrics', async (req, res) => {
  try {
    const text = await buildMetricsText();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(text);
  } catch (err) {
    logger.error({ err }, 'GET /metrics failed');
    res.status(500).json({ error: 'failed to build metrics' });
  }
});

module.exports = router;
