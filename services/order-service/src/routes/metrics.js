const express = require('express');
const { getMetrics } = require('../metricsState');

const router = express.Router();

router.get('/metrics', (req, res) => {
  const metrics = getMetrics();
  res.json({
    ...metrics,
    chaosActive: false,
    chaosType: null,
  });
});

module.exports = router;
