process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:9999';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy-test-key';
delete process.env.GROQ_API_KEY;

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const { diagnose, buildContext } = require('../src/diagnose');

test('buildContext pulls the affected service plus its call-chain neighbors', async () => {
  const seen = [];
  db.getRecentSnapshots = async (serviceName) => {
    seen.push(serviceName);
    return [{ service_name: serviceName, request_count: 10, error_count: 0, p95_latency_ms: 50 }];
  };

  const context = await buildContext({ service_name: 'order-service-a', fault_type: 'latency' });

  assert.equal(context.affectedService, 'order-service-a');
  assert.equal(context.faultType, 'latency');
  assert.deepEqual(
    new Set(seen),
    new Set(['order-service-a', 'inventory-service', 'notification-service'])
  );
  assert.ok(context.recentMetrics['order-service-a']);
  assert.ok(context.recentMetrics['inventory-service']);
  assert.ok(context.recentMetrics['notification-service']);
});

test('diagnose falls back to a safe default when GROQ_API_KEY is unset', async () => {
  db.getRecentSnapshots = async () => [];

  const result = await diagnose({ service_name: 'inventory-service', fault_type: 'error_rate' });

  assert.equal(result.rootCause, 'Diagnosis unavailable — LLM call failed');
  assert.equal(result.confidence, 'low');
  assert.equal(result.recommendedAction, 'restart');
  assert.ok(result.context, 'fallback still carries the context that was built, for storage in raw_context');
});
