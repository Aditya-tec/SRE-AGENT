const express = require('express');
const { recordPendingTrigger } = require('../triggerContext');

const router = express.Router();

const SERVICE_URLS = {
  'order-service-a': process.env.ORDER_A_URL || 'http://localhost:3001',
  'order-service-b': process.env.ORDER_B_URL || 'http://localhost:3011',
  'inventory-service': process.env.INVENTORY_URL || 'http://localhost:3002',
  'notification-service': process.env.NOTIFICATION_URL || 'http://localhost:3003',
};

const VALID_FAULTS = ['latency', 'error_rate', 'crash'];
const DEFAULT_DURATION_SEC = 30;

// All chaos flows through here (dashboard button and the scheduled
// GitHub Action alike) so it's logged consistently in one place.
router.post('/break-it', async (req, res) => {
  const { service, faultType, triggerType } = req.body || {};

  if (!(service in SERVICE_URLS)) {
    return res.status(400).json({ error: `service must be one of ${Object.keys(SERVICE_URLS).join(', ')}` });
  }
  if (!VALID_FAULTS.includes(faultType)) {
    return res.status(400).json({ error: `faultType must be one of ${VALID_FAULTS.join(', ')}` });
  }

  recordPendingTrigger(service, triggerType === 'autonomous' ? 'autonomous' : 'manual');

  try {
    await fetch(`${SERVICE_URLS[service]}/chaos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: faultType, durationSec: DEFAULT_DURATION_SEC }),
    });
  } catch (err) {
    return res.status(502).json({ error: `failed to reach ${service}: ${err.message}` });
  }

  // The incidents row is created once the poller's debounce confirms
  // the fault, not synchronously here.
  res.status(202).json({ incidentIdPending: true });
});

module.exports = router;
