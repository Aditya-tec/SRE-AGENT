const express = require('express');
const { z } = require('zod');
const { recordPendingTrigger } = require('../triggerContext');
const chaosLock = require('../chaosLock');
const autonomyState = require('../autonomyState');

const router = express.Router();

const SERVICE_URLS = {
  'order-service-a': process.env.ORDER_A_URL || 'http://localhost:3001',
  'order-service-b': process.env.ORDER_B_URL || 'http://localhost:3011',
  'inventory-service': process.env.INVENTORY_URL || 'http://localhost:3002',
  'notification-service': process.env.NOTIFICATION_URL || 'http://localhost:3003',
};

const VALID_FAULTS = ['latency', 'error_rate', 'crash'];
const DEFAULT_DURATION_SEC = 30;

// Named multi-step scenarios — orchestrate existing /chaos endpoints
// in sequence. No new subsystems.
const SCENARIOS = {
  'cascading-failure': [
    { service: 'inventory-service', faultType: 'latency', waitSec: 10 },
    { service: 'notification-service', faultType: 'crash', waitSec: 0 },
  ],
  'dual-replica-pressure': [
    { service: 'order-service-a', faultType: 'latency', waitSec: 5 },
    { service: 'order-service-b', faultType: 'error_rate', waitSec: 0 },
  ],
  'inventory-then-orders': [
    { service: 'inventory-service', faultType: 'error_rate', waitSec: 8 },
    { service: 'order-service-a', faultType: 'latency', waitSec: 0 },
  ],
};

const breakItSchema = z
  .object({
    service: z.string().optional(),
    faultType: z.enum(VALID_FAULTS).optional(),
    triggerType: z.enum(['manual', 'autonomous']).optional(),
    scenario: z.string().optional(),
  })
  .refine((b) => b.scenario || (b.service && b.faultType), {
    message: 'provide either scenario or service+faultType',
  });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function injectChaos(service, faultType) {
  const res = await fetch(`${SERVICE_URLS[service]}/chaos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.CHAOS_SECRET ? { 'x-chaos-secret': process.env.CHAOS_SECRET } : {}),
    },
    body: JSON.stringify({ type: faultType, durationSec: DEFAULT_DURATION_SEC }),
  });

  // fetch() only rejects on a network failure — a 401 (CHAOS_SECRET
  // mismatch between this service and the target) or any other HTTP
  // error status resolves normally and was previously swallowed here,
  // so /break-it reported success (202) and the dashboard showed
  // "Broken on purpose" even though no fault was ever actually applied.
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${service} /chaos returned ${res.status}${body ? `: ${body}` : ''}`);
  }
}

// All chaos flows through here (dashboard button and the scheduled
// GitHub Action alike) so it's logged consistently in one place.
router.post('/break-it', async (req, res) => {
  if (chaosLock.isLocked()) {
    return res.status(409).json({ error: 'an incident is already being investigated — try again shortly' });
  }

  const parsed = breakItSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { service, faultType, triggerType, scenario } = parsed.data;

  // Blocks every trigger — manual or autonomous — not just the
  // scheduled job. /break-it is public and unauthenticated by design
  // (see README's "No authentication, by design"), which means there
  // is no way to tell "the operator testing manually" apart from
  // "someone hammering the public API directly" — this exists as a
  // blunt emergency stop for exactly that second case. 200, not an
  // error: the GitHub Actions job uses `curl -sf` and shouldn't show as
  // a failed run just because chaos is deliberately paused.
  if (await autonomyState.isPaused()) {
    return res.status(200).json({ skipped: true, reason: 'chaos is paused' });
  }

  if (scenario) {
    const steps = SCENARIOS[scenario];
    if (!steps) {
      return res.status(400).json({
        error: `scenario must be one of ${Object.keys(SCENARIOS).join(', ')}`,
      });
    }

    chaosLock.acquire();
    try {
      for (const [i, step] of steps.entries()) {
        if (!Object.prototype.hasOwnProperty.call(SERVICE_URLS, step.service)) {
          throw new Error(`unknown service in scenario: ${step.service}`);
        }
        recordPendingTrigger(step.service, triggerType === 'autonomous' ? 'autonomous' : 'manual');
        await injectChaos(step.service, step.faultType);
        if (step.waitSec > 0 && i < steps.length - 1) {
          await sleep(step.waitSec * 1000);
        }
      }
    } catch (err) {
      chaosLock.release();
      return res.status(502).json({ error: `scenario failed: ${err.message}` });
    }

    return res.status(202).json({ incidentIdPending: true, scenario });
  }

  // Object.prototype.hasOwnProperty, not the `in` operator: `in` also
  // matches inherited keys, so a request with service: "constructor" or
  // "toString" would otherwise slip past this allowlist check and be
  // used to index SERVICE_URLS below.
  if (typeof service !== 'string' || !Object.prototype.hasOwnProperty.call(SERVICE_URLS, service)) {
    return res.status(400).json({ error: `service must be one of ${Object.keys(SERVICE_URLS).join(', ')}` });
  }

  // Acquired synchronously, before the first await below — not after
  // injectChaos() resolves. The isLocked() check above and this acquire()
  // must be one atomic step with no `await` between them, or concurrent
  // requests all read isLocked() as false before any of them sets it,
  // and all sail through (confirmed empirically: 10 simultaneous
  // requests each got a 202 when acquire() ran post-await). Node is
  // single-threaded, so two synchronous statements back to back can't
  // interleave — only a suspended `await` gives another request's
  // handler a chance to run in between.
  chaosLock.acquire();
  recordPendingTrigger(service, triggerType === 'autonomous' ? 'autonomous' : 'manual');

  try {
    await injectChaos(service, faultType);
  } catch (err) {
    chaosLock.release();
    return res.status(502).json({ error: `failed to reach ${service}: ${err.message}` });
  }

  // The incidents row is created once the poller's debounce confirms
  // the fault, not synchronously here.
  res.status(202).json({ incidentIdPending: true });
});

module.exports = router;
module.exports.SCENARIOS = SCENARIOS;
