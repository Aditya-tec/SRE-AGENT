process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:9999';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy-test-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../src/db');
const incidentsRoute = require('../src/routes/incidents');
const servicesRoute = require('../src/routes/services');
const poller = require('../src/poller');

async function withApp(run) {
  const app = express();
  app.use(express.json());
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

test('POST /incidents/:id/approve delegates to poller.approveIncident and returns its result', async () => {
  let calledWith;
  poller.approveIncident = async (id) => {
    calledWith = id;
    return { ok: true };
  };
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/incidents/inc_42/approve`, { method: 'POST' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { approved: true });
    assert.equal(calledWith, 'inc_42');
  });
});

test('POST /incidents/:id/approve returns 400 when there is nothing to approve', async () => {
  poller.approveIncident = async () => ({ ok: false, error: 'no active incident with that id' });
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/incidents/inc_99/approve`, { method: 'POST' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'no active incident with that id');
  });
});

test('GET /confidence-report aggregates success rate per confidence level', async () => {
  db.listIncidents = async () => [
    { confidence: 'high', resolved_at: 't1', remediation_success: true },
    { confidence: 'high', resolved_at: 't2', remediation_success: true },
    { confidence: 'high', resolved_at: 't3', remediation_success: false },
    { confidence: 'high', resolved_at: null, remediation_success: null }, // still open — excluded from the rate
    { confidence: 'medium', resolved_at: 't4', remediation_success: false },
    { confidence: 'low', resolved_at: null, remediation_success: null }, // never resolved
    { confidence: null, resolved_at: 't5', remediation_success: true }, // pre-dates confidence tracking — ignored
  ];
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/confidence-report`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      high: { total: 4, resolved: 3, succeeded: 2, successRate: 2 / 3 },
      medium: { total: 1, resolved: 1, succeeded: 0, successRate: 0 },
      low: { total: 1, resolved: 0, succeeded: 0, successRate: null },
    });
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
