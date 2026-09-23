const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

function startMockOrderServer(status, body) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    });
    server.listen(0, () => resolve(server));
    server.unref(); // never block this test file's process from exiting
  });
}

async function withGatewayApp(replicaAUrl, replicaBUrl, run) {
  process.env.ORDER_A_URL = replicaAUrl;
  process.env.ORDER_B_URL = replicaBUrl;

  for (const mod of ['../src/routes/gateway', '../src/gatewayState']) {
    delete require.cache[require.resolve(mod)];
  }
  const gatewayRoute = require('../src/routes/gateway');
  const gatewayState = require('../src/gatewayState');

  const app = express();
  app.use(express.json());
  app.use(gatewayRoute);
  const server = app.listen(0);
  server.unref();
  const baseUrl = `http://localhost:${server.address().port}`;

  try {
    await run(baseUrl, gatewayState);
  } finally {
    server.close();
  }
}

test('gateway forwards to replica a by default', async () => {
  const replicaA = await startMockOrderServer(201, { orderId: 'ord_a', from: 'a' });
  const replicaB = await startMockOrderServer(201, { orderId: 'ord_b', from: 'b' });
  try {
    await withGatewayApp(`http://localhost:${replicaA.address().port}`, `http://localhost:${replicaB.address().port}`, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/gateway/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: 'cap', quantity: 1 }),
      });
      assert.equal(res.status, 201);
      assert.equal((await res.json()).from, 'a');
    });
  } finally {
    replicaA.close();
    replicaB.close();
  }
});

test('gateway forwards to replica b after traffic_shift', async () => {
  const replicaA = await startMockOrderServer(201, { from: 'a' });
  const replicaB = await startMockOrderServer(201, { from: 'b' });
  try {
    await withGatewayApp(`http://localhost:${replicaA.address().port}`, `http://localhost:${replicaB.address().port}`, async (baseUrl, gatewayState) => {
      gatewayState.setActiveReplica('b');
      const res = await fetch(`${baseUrl}/gateway/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: 'cap', quantity: 1 }),
      });
      assert.equal((await res.json()).from, 'b');
    });
  } finally {
    replicaA.close();
    replicaB.close();
  }
});

test('gateway rejects with 503 when a downstream service is rate-limited, without forwarding', async () => {
  const replicaA = await startMockOrderServer(201, { from: 'a' });
  try {
    await withGatewayApp(`http://localhost:${replicaA.address().port}`, `http://localhost:${replicaA.address().port}`, async (baseUrl, gatewayState) => {
      gatewayState.setRateLimit('inventory-service', 1); // always reject
      const res = await fetch(`${baseUrl}/gateway/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: 'cap', quantity: 1 }),
      });
      assert.equal(res.status, 503);
      gatewayState.clearRateLimit('inventory-service');
    });
  } finally {
    replicaA.close();
  }
});

test('gateway returns 502 when the active replica is unreachable', async () => {
  await withGatewayApp('http://localhost:1', 'http://localhost:1', async (baseUrl) => {
    const res = await fetch(`${baseUrl}/gateway/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: 'cap', quantity: 1 }),
    });
    assert.equal(res.status, 502);
  });
});
