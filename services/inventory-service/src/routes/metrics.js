const express = require('express');
const { getMetrics } = require('../metricsState');
const { getStatus } = require('../chaosState');

const router = express.Router();

router.get('/metrics', (req, res) => {
  const metrics = getMetrics();
  const chaos = getStatus();
  res.json({
    ...metrics,
    chaosActive: chaos.active,
    chaosType: chaos.type,
  });
});

module.exports = router;
