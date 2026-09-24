process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:9999';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy-test-key';
delete process.env.RENDER_API_KEY;
delete process.env.GROQ_API_KEY;

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const db = require('../src/db');

// In-memory replacement for Supabase — lets the poller's real
// detect -> diagnose -> remediate -> verify -> resolve logic run end
// to end without a live database.
function installFakeDb() {
  const incidents = new Map();
  let nextId = 1;

  db.upsertService = async () => {};
  db.listServices = async () => [];
  db.insertMetricsSnapshot = async () => {};
  db.deleteOldSnapshots = async () => {};
  db.getRecentSnapshots = async () => [];
  db.getUnresolvedIncident = async (serviceName) => {
    for (const inc of incidents.values()) {
      if (inc.service_name === serviceName && !inc.resolved_at) return inc;
    }
    return null;
  };
  db.insertIncident = async (fields) => {
    const id = `inc_${nextId++}`;
    const row = { id, ...fields };
    incidents.set(id, row);
    return row;
  };
  db.updateIncident = async (id, fields) => {
    const row = { ...incidents.get(id), ...fields };
    incidents.set(id, row);
    return row;
  };
  db.listIncidents = async (limit) => [...incidents.values()].slice(0, limit);
  db.getIncident = async (id) => incidents.get(id) || null;

  return incidents;
}

function startHealthServer({ healthy }) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // Force a fresh TCP connection per request — ephemeral ports get
      // recycled rapidly across these tests, and a pooled keep-alive
      // connection surviving past this server's shutdown is a real
      // source of flakiness (fetch silently hitting whatever now
      // listens on a reused port) that has nothing to do with the
      // poller logic under test.
      res.setHeader('Connection', 'close');
      if (req.url === '/health') {
        res.writeHead(healthy() ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: healthy() ? 'healthy' : 'down' }));
      } else if (req.url === '/metrics') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ requestCount: 10, errorCount: 0, p95LatencyMs: 20 }));
      } else {
        res.writeHead(404).end();
      }
    });
    server.keepAliveTimeout = 1;
    server.listen(0, () => resolve(server));
    server.unref(); // never block this test file's process from exiting
  });
}

async function freshPoller(urls) {
  process.env.ORDER_A_URL = urls.orderA;
  process.env.ORDER_B_URL = urls.orderB;
  process.env.INVENTORY_URL = urls.inventory;
  process.env.NOTIFICATION_URL = urls.notification;

  for (const mod of [
    '../src/poller',
    '../src/detector',
    '../src/diagnose',
    '../src/remediate',
    '../src/postmortem',
    '../src/gatewayState',
    '../src/triggerContext',
    '../src/chaosLock',
  ]) {
    delete require.cache[require.resolve(mod)];
  }
  return require('../src/poller');
}

test('a permanently unreachable service reaches Unresolved after exactly 3 remediation attempts', async () => {
  const incidents = installFakeDb();
  const down = await startHealthServer({ healthy: () => false });
  const healthyStub = await startHealthServer({ healthy: () => true });

  try {
    const poller = await freshPoller({
      orderA: `http://localhost:${down.address().port}`,
      orderB: `http://localhost:${healthyStub.address().port}`,
      inventory: `http://localhost:${healthyStub.address().port}`,
      notification: `http://localhost:${healthyStub.address().port}`,
    });

    // 5 cycles is the theoretical minimum (debounce, detect, 3x
    // remediate+verify) — 10 gives real headroom against event-loop
    // jitter under full-suite load without masking a genuine hang.
    let incident;
    for (let cycle = 0; cycle < 10; cycle++) {
      await poller.pollAll();
      incident = [...incidents.values()].find((i) => i.service_name === 'order-service-a');
      if (incident && incident.resolved_at) break;
    }

    assert.ok(incident, 'an incident should have opened for order-service-a');
    assert.equal(incident.resolved_at != null, true);
    assert.equal(incident.remediation_success, false);
    assert.ok(incident.postmortem, 'a postmortem should be generated even for an unresolved incident');
  } finally {
    down.close();
    healthyStub.close();
  }
});

test('a service that recovers mid-incident reaches Resolved after 2 consecutive healthy polls', async () => {
  const incidents = installFakeDb();
  let isHealthy = false;
  const flaky = await startHealthServer({ healthy: () => isHealthy });
  const healthyStub = await startHealthServer({ healthy: () => true });

  try {
    const poller = await freshPoller({
      orderA: `http://localhost:${flaky.address().port}`,
      orderB: `http://localhost:${healthyStub.address().port}`,
      inventory: `http://localhost:${healthyStub.address().port}`,
      notification: `http://localhost:${healthyStub.address().port}`,
    });

    // Poll until the incident opens (normally 2 cycles; allow a few
    // extra in case a poll blips healthy on a recycled ephemeral port).
    let incident;
    for (let cycle = 0; cycle < 5 && !incident; cycle++) {
      await poller.pollAll();
      incident = [...incidents.values()].find((i) => i.service_name === 'order-service-a');
    }
    assert.ok(incident, 'incident should be open after debounce confirms the anomaly');
    assert.equal(incident.resolved_at, undefined);

    isHealthy = true;
    let resolved;
    for (let cycle = 0; cycle < 5; cycle++) {
      await poller.pollAll();
      const current = [...incidents.values()].find((i) => i.service_name === 'order-service-a');
      if (current && current.resolved_at) {
        resolved = current;
        break;
      }
    }

    assert.ok(resolved, 'incident should resolve once the service recovers');
    assert.equal(resolved.remediation_success, true);
  } finally {
    flaky.close();
    healthyStub.close();
  }
});

test('duplicate-incident guard: only one open incident per service at a time', async () => {
  const incidents = installFakeDb();
  const down = await startHealthServer({ healthy: () => false });
  const healthyStub = await startHealthServer({ healthy: () => true });

  try {
    const poller = await freshPoller({
      orderA: `http://localhost:${down.address().port}`,
      orderB: `http://localhost:${healthyStub.address().port}`,
      inventory: `http://localhost:${healthyStub.address().port}`,
      notification: `http://localhost:${healthyStub.address().port}`,
    });

    // Check the invariant after every cycle, not just at a fixed cycle
    // count: a transient false-healthy poll (ephemeral test ports can
    // occasionally blip) would delay debounce convergence by a cycle
    // without weakening the actual guarantee under test — that this
    // service never has more than one open incident at once.
    let sawAnOpenIncident = false;
    for (let cycle = 0; cycle < 8; cycle++) {
      await poller.pollAll();
      const openForOrderA = [...incidents.values()].filter((i) => i.service_name === 'order-service-a' && !i.resolved_at);
      assert.ok(openForOrderA.length <= 1, `cycle ${cycle}: found ${openForOrderA.length} concurrently-open incidents for order-service-a`);
      if (openForOrderA.length === 1) sawAnOpenIncident = true;
    }

    assert.ok(sawAnOpenIncident, 'an incident should have opened for order-service-a at some point');
  } finally {
    down.close();
    healthyStub.close();
  }
});

test('getLastPollAt is null before the first cycle and set after each cycle', async () => {
  installFakeDb();
  const healthyStub = await startHealthServer({ healthy: () => true });

  try {
    const poller = await freshPoller({
      orderA: `http://localhost:${healthyStub.address().port}`,
      orderB: `http://localhost:${healthyStub.address().port}`,
      inventory: `http://localhost:${healthyStub.address().port}`,
      notification: `http://localhost:${healthyStub.address().port}`,
    });

    assert.equal(poller.getLastPollAt(), null);
    await poller.pollAll();
    const first = poller.getLastPollAt();
    assert.ok(first, 'lastPollAt should be set after a cycle completes');

    await new Promise((resolve) => setTimeout(resolve, 5));
    await poller.pollAll();
    assert.notEqual(poller.getLastPollAt(), first, 'lastPollAt should advance on each cycle');
  } finally {
    healthyStub.close();
  }
});

test('overlapping pollAll calls: a slow cycle is not run twice concurrently', async () => {
  installFakeDb();
  // Track concurrency on ONE service only (order-service-a). A single
  // legitimate cycle polls all 4 services in parallel, so pointing
  // every service at this same tracker would show "4 concurrent" just
  // from one normal cycle — that's not what's under test here. What's
  // under test is whether THIS one service ever gets hit twice at once
  // across two overlapping pollAll() invocations.
  let inFlight = 0;
  let maxConcurrent = 0;
  let totalRequests = 0;

  const slow = await new Promise((resolve) => {
    const server = require('node:http').createServer((req, res) => {
      res.setHeader('Connection', 'close');
      if (req.url === '/health') {
        totalRequests++;
        inFlight++;
        maxConcurrent = Math.max(maxConcurrent, inFlight);
        setTimeout(() => {
          inFlight--;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'healthy' }));
        }, 200);
      } else if (req.url === '/metrics') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ requestCount: 10, errorCount: 0, p95LatencyMs: 20 }));
      } else {
        res.writeHead(404).end();
      }
    });
    server.keepAliveTimeout = 1;
    server.listen(0, () => resolve(server));
    server.unref();
  });
  const fastStub = await startHealthServer({ healthy: () => true });

  try {
    const poller = await freshPoller({
      orderA: `http://localhost:${slow.address().port}`,
      orderB: `http://localhost:${fastStub.address().port}`,
      inventory: `http://localhost:${fastStub.address().port}`,
      notification: `http://localhost:${fastStub.address().port}`,
    });

    // Fire two cycles back to back without awaiting the first — this is
    // exactly what a slow tick + setInterval firing again would do.
    const firstCall = poller.pollAll();
    const secondCall = poller.pollAll();
    await Promise.all([firstCall, secondCall]);

    // If the guard failed and both cycles actually ran, order-service-a
    // would be hit twice (once per cycle) with overlapping in-flight
    // requests. If the guard worked, the second call skipped entirely
    // before reaching any service, so exactly 1 request landed here.
    assert.equal(maxConcurrent, 1, `expected no concurrent /health requests to the same service, saw ${maxConcurrent}`);
    assert.equal(totalRequests, 1, `expected the second pollAll() call to be skipped entirely, but order-service-a was polled ${totalRequests} times`);
  } finally {
    slow.close();
    fastStub.close();
  }
});

test('chaosLock releases once the incident it was holding for resolves', async () => {
  const incidents = installFakeDb();
  const down = await startHealthServer({ healthy: () => false });
  const healthyStub = await startHealthServer({ healthy: () => true });

  try {
    const poller = await freshPoller({
      orderA: `http://localhost:${down.address().port}`,
      orderB: `http://localhost:${healthyStub.address().port}`,
      inventory: `http://localhost:${healthyStub.address().port}`,
      notification: `http://localhost:${healthyStub.address().port}`,
    });
    const chaosLock = require('../src/chaosLock');

    chaosLock.acquire();
    assert.equal(chaosLock.isLocked(), true);

    // 5 cycles is the theoretical minimum (debounce, detect, 3x
    // remediate+verify) — 10 gives real headroom against event-loop
    // jitter under full-suite load without masking a genuine hang.
    let incident;
    for (let cycle = 0; cycle < 10; cycle++) {
      await poller.pollAll();
      incident = [...incidents.values()].find((i) => i.service_name === 'order-service-a');
      if (incident && incident.resolved_at) break;
    }

    assert.ok(incident && incident.resolved_at, 'incident should have resolved (as Unresolved) within the loop');
    assert.equal(chaosLock.isLocked(), false, 'lock should release once nothing is left in activeIncidents');
  } finally {
    down.close();
    healthyStub.close();
  }
});
