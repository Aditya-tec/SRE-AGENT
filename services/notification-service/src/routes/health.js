const express = require('express');
const { getState } = require('../chaosState');

const router = express.Router();
const startedAt = Date.now();

router.get('/health', (req, res) => {
  const chaos = getState();
  if (chaos.active && chaos.type === 'crash') {
    return res.status(503).json({ status: 'down', service: 'notification-service' });
  }

  res.json({
    status: 'healthy',
    service: 'notification-service',
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
  });
});

module.exports = router;
