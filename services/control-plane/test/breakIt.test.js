process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:9999';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy-test-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

function startMockChaosServer() {
  const received = [];
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received.push({ url: req.url, headers: req.headers, body: body ? JSON.parse(body) : {} });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ applied: true }));
      });
    });
    server.listen(0, () => resolve({ server, received }));
    server.unref(); // never block this test file's process from exiting
  });
}

async function withBreakItApp(run) {
  const { server: inventoryServer, received } = await startMockChaosServer();
  const { port } = inventoryServer.address();

  process.env.INVENTORY_URL = `http://localhost:${port}`;
  process.env.ORDER_A_URL = 'http://localhost:1'; // unused in these tests
  process.env.ORDER_B_URL = 'http://localhost:1';
  process.env.NOTIFICATION_URL = 'http://localhost:1';

  for (const mod of ['../src/routes/breakIt', '../src/triggerContext', '../src/chaosLock']) {
    delete require.cache[require.resolve(mod)];
  }
  const breakItRoute = require('../src/routes/breakIt');
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use(breakItRoute);

  const appServer = app.listen(0);
  appServer.unref();
  const baseUrl = `http://localhost:${appServer.address().port}`;

  try {
    await run(baseUrl, received);
  } finally {
    // unref() alone doesn't help here — it only stops the listening
    // handle from keeping the event loop alive, not the individual
    // keep-alive sockets fetch() leaves open. Force them closed so
    // .close() actually completes instead of waiting on the socket's
    // own idle timeout.
    appServer.closeAllConnections();
    inventoryServer.closeAllConnections();
    appServer.close();
    inventoryServer.close();
  }
}

test('POST /break-it rejects an unknown service', async () => {
  await withBreakItApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/break-it`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'made-up-service', faultType: 'crash' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /break-it rejects an invalid fault type', async () => {
  await withBreakItApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/break-it`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'inventory-service', faultType: 'nonsense' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /break-it with valid input calls the target service /chaos and returns 202', async () => {
  await withBreakItApp(async (baseUrl, received) => {
    const res = await fetch(`${baseUrl}/break-it`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'inventory-service', faultType: 'latency' }),
    });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { incidentIdPending: true });

    assert.equal(received.length, 1);
    assert.equal(received[0].url, '/chaos');
    assert.equal(received[0].body.type, 'latency');
  });
});

test('POST /break-it forwards CHAOS_SECRET as a header when configured', async () => {
  process.env.CHAOS_SECRET = 'super-secret';
  try {
    await withBreakItApp(async (baseUrl, received) => {
      await fetch(`${baseUrl}/break-it`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: 'inventory-service', faultType: 'crash' }),
      });
      assert.equal(received[0].headers['x-chaos-secret'], 'super-secret');
    });
  } finally {
    delete process.env.CHAOS_SECRET;
  }
});

test('POST /break-it acquires the chaos lock on success, and a second trigger is rejected with 409 while it holds', async () => {
  await withBreakItApp(async (baseUrl, received) => {
    // Same instance breakIt.js uses internally, required after
    // withBreakItApp's fresh re-require — needed to release the lock's
    // 5-minute safety timer at the end so it doesn't keep this test
    // process alive.
    const chaosLock = require('../src/chaosLock');
    try {
      const first = await fetch(`${baseUrl}/break-it`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: 'inventory-service', faultType: 'latency' }),
      });
      assert.equal(first.status, 202);
      assert.equal(chaosLock.isLocked(), true);

      const second = await fetch(`${baseUrl}/break-it`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: 'inventory-service', faultType: 'crash' }),
      });
      assert.equal(second.status, 409);
      assert.match((await second.json()).error, /already being investigated/);

      // Only the first trigger should have reached the target service.
      assert.equal(received.length, 1);
    } finally {
      chaosLock.release();
    }
  });
});

test('POST /break-it lock check happens before request-body validation', async () => {
  await withBreakItApp(async (baseUrl) => {
    // Required only after withBreakItApp has cleared and re-required
    // the module fresh, so this is the same instance breakIt.js sees.
    const chaosLock = require('../src/chaosLock');
    chaosLock.acquire();
    try {
      const res = await fetch(`${baseUrl}/break-it`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: 'not-a-real-service', faultType: 'nonsense' }),
      });
      assert.equal(res.status, 409, 'the lock should reject before validation ever runs');
    } finally {
      chaosLock.release();
    }
  });
});

test('POST /break-it scenario orchestrates chaos steps in sequence', async () => {
  const inventory = await startMockChaosServer();
  const notification = await startMockChaosServer();
  process.env.INVENTORY_URL = `http://localhost:${inventory.server.address().port}`;
  process.env.NOTIFICATION_URL = `http://localhost:${notification.server.address().port}`;
  process.env.ORDER_A_URL = 'http://localhost:1';
  process.env.ORDER_B_URL = 'http://localhost:1';

  for (const mod of ['../src/routes/breakIt', '../src/triggerContext', '../src/chaosLock']) {
    delete require.cache[require.resolve(mod)];
  }
  const breakItRoute = require('../src/routes/breakIt');
  // Skip the real 10s inter-step delay so this stays a unit test.
  breakItRoute.SCENARIOS['cascading-failure'][0].waitSec = 0;

  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use(breakItRoute);
  const appServer = app.listen(0);
  appServer.unref();
  const baseUrl = `http://localhost:${appServer.address().port}`;
  const chaosLock = require('../src/chaosLock');

  try {
    const res = await fetch(`${baseUrl}/break-it`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'cascading-failure' }),
    });
    assert.equal(res.status, 202);
    assert.equal((await res.json()).scenario, 'cascading-failure');
    assert.equal(inventory.received.length, 1);
    assert.equal(inventory.received[0].body.type, 'latency');
    assert.equal(notification.received.length, 1);
    assert.equal(notification.received[0].body.type, 'crash');
    assert.equal(chaosLock.isLocked(), true);
  } finally {
    chaosLock.release();
    appServer.closeAllConnections();
    inventory.server.closeAllConnections();
    notification.server.closeAllConnections();
    appServer.close();
    inventory.server.close();
    notification.server.close();
  }
});
