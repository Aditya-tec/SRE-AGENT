process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:9999';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy-test-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../src/db');
const incidentsRoute = require('../src/routes/incidents');
const servicesRoute = require('../src/routes/services');

async function withApp(run) {
  const app = express();
  app.use(incidentsRoute);
  app.use(servicesRoute);
  const server = app.listen(0);
  server.unref();
  const baseUrl = `http://localhost:${server.address().port}`;
  try {
    await run(baseUrl);
  } finally {
    server.close();
  }
}

test('GET /services maps db rows to the dashboard contract shape', async () => {
  db.listServices = async () => [
    { name: 'order-service-a', status: 'healthy', last_seen_at: '2026-09-22T00:00:00Z', last_latency_ms: 40, last_error_rate: 0 },
  ];
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/services`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [
      { name: 'order-service-a', status: 'healthy', lastSeenAt: '2026-09-22T00:00:00Z', lastLatencyMs: 40, lastErrorRate: 0 },
    ]);
  });
});

test('GET /incidents respects the limit query param', async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ id: `inc_${i}`, detected_at: `2026-09-22T00:0${i}:00Z` }));
  db.listIncidents = async (limit) => rows.slice(0, limit);

  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/incidents?limit=2`);
    const data = await res.json();
    assert.equal(data.length, 2);
  });
});

test('GET /incidents/:id returns 404 for a missing incident', async () => {
  db.getIncident = async () => null;
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/incidents/does-not-exist`);
    assert.equal(res.status, 404);
  });
});

test('GET /incidents/:id returns the incident when found', async () => {
  db.getIncident = async (id) => ({ id, service_name: 'inventory-service' });
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/incidents/inc_42`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).service_name, 'inventory-service');
  });
});

test('a DB error surfaces as 500 rather than crashing the process', async () => {
  db.listServices = async () => {
    throw new Error('connection refused');
  };
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/services`);
    assert.equal(res.status, 500);
  });
});
