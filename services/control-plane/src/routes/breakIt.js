const express = require('express');
const { recordPendingTrigger } = require('../triggerContext');
const chaosLock = require('../chaosLock');

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
  if (chaosLock.isLocked()) {
    return res.status(409).json({ error: 'an incident is already being investigated — try again shortly' });
  }

  const { service, faultType, triggerType } = req.body || {};

  // Object.prototype.hasOwnProperty, not the `in` operator: `in` also
  // matches inherited keys, so a request with service: "constructor" or
  // "toString" would otherwise slip past this allowlist check and be
  // used to index SERVICE_URLS below.
  if (typeof service !== 'string' || !Object.prototype.hasOwnProperty.call(SERVICE_URLS, service)) {
    return res.status(400).json({ error: `service must be one of ${Object.keys(SERVICE_URLS).join(', ')}` });
  }
  if (!VALID_FAULTS.includes(faultType)) {
    return res.status(400).json({ error: `faultType must be one of ${VALID_FAULTS.join(', ')}` });
  }

  recordPendingTrigger(service, triggerType === 'autonomous' ? 'autonomous' : 'manual');

  try {
    await fetch(`${SERVICE_URLS[service]}/chaos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.CHAOS_SECRET ? { 'x-chaos-secret': process.env.CHAOS_SECRET } : {}),
      },
      body: JSON.stringify({ type: faultType, durationSec: DEFAULT_DURATION_SEC }),
    });
  } catch (err) {
    return res.status(502).json({ error: `failed to reach ${service}: ${err.message}` });
  }

  chaosLock.acquire();

  // The incidents row is created once the poller's debounce confirms
  // the fault, not synchronously here.
  res.status(202).json({ incidentIdPending: true });
});

module.exports = router;
