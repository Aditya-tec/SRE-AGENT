const express = require('express');

const router = express.Router();
const startedAt = Date.now();

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'order-service',
    replicaId: process.env.REPLICA_ID || 'a',
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
  });
});

module.exports = router;
