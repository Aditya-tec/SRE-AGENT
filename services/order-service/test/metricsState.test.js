const test = require('node:test');
const assert = require('node:assert/strict');

test('metricsState tracks a sliding window, not all-time cumulative counts', () => {
  delete require.cache[require.resolve('../src/metricsState')];
  const { recordRequest, getMetrics } = require('../src/metricsState');

  for (let i = 0; i < 100; i++) recordRequest(10, false);
  assert.equal(getMetrics().requestCount, 100);
  assert.equal(getMetrics().errorCount, 0);

  // A burst of errors after many healthy requests should be visible
  // immediately, not diluted by all-time history (the bug found and
  // fixed while building Phase 4 — this is the regression test for it).
  for (let i = 0; i < 10; i++) recordRequest(10, true);
  const metrics = getMetrics();
  assert.equal(metrics.requestCount, 100, 'window is capped at 100');
  assert.equal(metrics.errorCount, 10);
  assert.equal(metrics.errorCount / metrics.requestCount, 0.1);
});

test('p95LatencyMs reflects the current window', () => {
  delete require.cache[require.resolve('../src/metricsState')];
  const { recordRequest, getMetrics } = require('../src/metricsState');

  for (let i = 1; i <= 100; i++) recordRequest(i, false);
  const metrics = getMetrics();
  assert.ok(metrics.p95LatencyMs >= 94 && metrics.p95LatencyMs <= 100, `expected ~95th percentile, got ${metrics.p95LatencyMs}`);
});

test('getMetrics on an empty window returns zeros, not NaN', () => {
  delete require.cache[require.resolve('../src/metricsState')];
  const { getMetrics } = require('../src/metricsState');

  const metrics = getMetrics();
  assert.equal(metrics.requestCount, 0);
  assert.equal(metrics.errorCount, 0);
  assert.equal(metrics.p95LatencyMs, 0);
});
