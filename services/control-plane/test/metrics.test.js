process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:9999';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy-test-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../src/db');
const { buildMetricsText } = require('../src/metrics');
const metricsRoute = require('../src/routes/metrics');

async function withApp(run) {
  const app = express();
  app.use(metricsRoute);
  const server = app.listen(0);
  server.unref();
  const baseUrl = `http://localhost:${server.address().port}`;
  try {
    await run(baseUrl);
  } finally {
    server.close();
  }
}

test('buildMetricsText exposes service health as a Prometheus gauge', async () => {
  db.listServices = async () => [
    { name: 'order-service-a', status: 'healthy', last_latency_ms: 40, last_error_rate: 0.01 },
    { name: 'inventory-service', status: 'down', last_latency_ms: null, last_error_rate: null },
  ];
  db.listIncidents = async () => [];

  const text = await buildMetricsText();

  assert.match(text, /# TYPE sre_service_up gauge/);
  assert.match(text, /sre_service_up\{service="order-service-a"\} 1/);
  assert.match(text, /sre_service_up\{service="inventory-service"\} 0/);
  assert.match(text, /sre_service_last_latency_ms\{service="order-service-a"\} 40/);
  assert.doesNotMatch(text, /sre_service_last_latency_ms\{service="inventory-service"\}/, 'null latency is omitted, not emitted as 0');
});

test('buildMetricsText computes MTTR only over resolved incidents', async () => {
  db.listServices = async () => [];
  db.listIncidents = async () => [
    { detected_at: '2026-09-24T00:00:00Z', resolved_at: '2026-09-24T00:02:00Z', confidence: 'high', is_flapping: false },
    { detected_at: '2026-09-24T00:00:00Z', resolved_at: null, confidence: 'high', is_flapping: false }, // still open
  ];

  const text = await buildMetricsText();

  assert.match(text, /sre_incidents_open 1/);
  assert.match(text, /sre_incident_mttr_seconds 120\.00/);
  assert.match(text, /sre_incidents_total\{confidence="high"\} 2/);
});

test('buildMetricsText counts flapping incidents', async () => {
  db.listServices = async () => [];
  db.listIncidents = async () => [
    { detected_at: 't1', resolved_at: 't1', confidence: null, is_flapping: true },
    { detected_at: 't2', resolved_at: null, confidence: null, is_flapping: false },
  ];

  const text = await buildMetricsText();

  assert.match(text, /sre_incidents_flapping_total 1/);
  assert.match(text, /sre_incidents_total\{confidence="unknown"\} 2/);
});

test('GET /metrics serves Prometheus text exposition format', async () => {
  db.listServices = async () => [];
  db.listIncidents = async () => [];

  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/metrics`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/plain/);
    const text = await res.text();
    assert.match(text, /# HELP sre_incidents_open/);
  });
});

test('GET /metrics 500s cleanly on a DB error instead of crashing', async () => {
  db.listServices = async () => {
    throw new Error('connection refused');
  };
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/metrics`);
    assert.equal(res.status, 500);
  });
});
