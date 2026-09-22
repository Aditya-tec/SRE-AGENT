const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

function startMockServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => handler(req, res, body ? JSON.parse(body) : {}));
    });
    server.listen(0, () => resolve(server));
  });
}

function serverUrl(server) {
  const { port } = server.address();
  return `http://localhost:${port}`;
}

async function withOrderApp(inventoryHandler, notificationHandler, run) {
  const inventoryServer = await startMockServer(inventoryHandler);
  const notificationServer = await startMockServer(notificationHandler);

  process.env.INVENTORY_URL = serverUrl(inventoryServer);
  process.env.NOTIFICATION_URL = serverUrl(notificationServer);
  delete process.env.CHAOS_SECRET;

  for (const mod of ['../src/app', '../src/routes/orders', '../src/chaosState', '../src/metricsState']) {
    delete require.cache[require.resolve(mod)];
  }
  const { createApp } = require('../src/app');
  const app = createApp();
  const server = app.listen(0);
  const baseUrl = serverUrl(server);

  try {
    await run(baseUrl);
  } finally {
    server.close();
    inventoryServer.close();
    notificationServer.close();
  }
}

test('POST /orders happy path: reserves stock, notifies, returns 201', async () => {
  await withOrderApp(
    (req, res, body) => {
      assert.equal(req.url, '/reserve');
      assert.deepEqual(body, { item: 'blue-mug', quantity: 2 });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ reserved: true, remaining: 48 }));
    },
    (req, res, body) => {
      assert.equal(req.url, '/notify');
      assert.equal(body.message, 'Your order is confirmed');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sent: true, channel: 'email' }));
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: 'blue-mug', quantity: 2 }),
      });
      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.status, 'confirmed');
      assert.match(data.orderId, /^ord_[0-9a-f]{8}$/);

      const lookup = await fetch(`${baseUrl}/orders/${data.orderId}`);
      assert.equal(lookup.status, 200);
      assert.deepEqual(await lookup.json(), data);
    }
  );
});

test('POST /orders propagates inventory 409 (insufficient stock) without calling notification', async () => {
  let notifyCalled = false;
  await withOrderApp(
    (req, res) => {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'insufficient stock', remaining: 0 }));
    },
    (req, res) => {
      notifyCalled = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sent: true }));
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: 'hoodie', quantity: 999 }),
      });
      assert.equal(res.status, 409);
      assert.equal((await res.json()).error, 'insufficient stock');
    }
  );
  assert.equal(notifyCalled, false, 'notification-service should not be called when reservation fails');
});

test('POST /orders rejects a malformed body with 400 and never calls inventory', async () => {
  let inventoryCalled = false;
  await withOrderApp(
    (req, res) => {
      inventoryCalled = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ reserved: true, remaining: 1 }));
    },
    (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sent: true }));
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: 'blue-mug' }),
      });
      assert.equal(res.status, 400);
    }
  );
  assert.equal(inventoryCalled, false);
});

test('an order still succeeds even if notification-service is unreachable', async () => {
  await withOrderApp(
    (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ reserved: true, remaining: 10 }));
    },
    (req, res) => {
      // Simulate an unreachable notification-service by destroying the
      // connection instead of responding.
      req.socket.destroy();
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: 'cap', quantity: 1 }),
      });
      assert.equal(res.status, 201, 'notification failures must not fail the order');
    }
  );
});

test('GET /orders/:id returns 404 for an unknown order', async () => {
  await withOrderApp(
    () => {},
    () => {},
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/orders/does-not-exist`);
      assert.equal(res.status, 404);
    }
  );
});
