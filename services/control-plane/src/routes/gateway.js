const express = require('express');
const { getActiveReplica, shouldRejectForRateLimit } = require('../gatewayState');

const router = express.Router();

const ORDER_URLS = {
  a: process.env.ORDER_A_URL || 'http://localhost:3001',
  b: process.env.ORDER_B_URL || 'http://localhost:3011',
};

const GATEWAY_TIMEOUT_MS = 8000;

// The one entry point real traffic (synthetic generator, dashboard demo
// requests) uses to reach order-service — never call order-service-a/-b
// directly, or a traffic_shift remediation has nothing real to redirect.
router.post('/gateway/orders', async (req, res) => {
  const limitedService = shouldRejectForRateLimit();
  if (limitedService) {
    return res.status(503).json({ error: `${limitedService} is degraded; rejecting to protect callers` });
  }

  const replica = getActiveReplica();
  const targetUrl = `${ORDER_URLS[replica]}/orders`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);

  try {
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
    const data = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: `order-service-${replica} unreachable` });
  } finally {
    clearTimeout(timeout);
  }
});

module.exports = router;
