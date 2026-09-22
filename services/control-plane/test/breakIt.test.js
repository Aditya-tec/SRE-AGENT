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
  });
}

async function withBreakItApp(run) {
  const { server: inventoryServer, received } = await startMockChaosServer();
  const { port } = inventoryServer.address();

  process.env.INVENTORY_URL = `http://localhost:${port}`;
  process.env.ORDER_A_URL = 'http://localhost:1'; // unused in these tests
  process.env.ORDER_B_URL = 'http://localhost:1';
  process.env.NOTIFICATION_URL = 'http://localhost:1';

  for (const mod of ['../src/routes/breakIt', '../src/triggerContext']) {
    delete require.cache[require.resolve(mod)];
  }
  const breakItRoute = require('../src/routes/breakIt');
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use(breakItRoute);

  const appServer = app.listen(0);
  const baseUrl = `http://localhost:${appServer.address().port}`;

  try {
    await run(baseUrl, received);
  } finally {
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
