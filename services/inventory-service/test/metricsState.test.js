const test = require('node:test');
const assert = require('node:assert/strict');

test('metricsState tracks a sliding window, not all-time cumulative counts', () => {
  delete require.cache[require.resolve('../src/metricsState')];
  const { recordRequest, getMetrics } = require('../src/metricsState');

  for (let i = 0; i < 20; i++) recordRequest(10, false);
  for (let i = 0; i < 5; i++) recordRequest(10, true);

  const metrics = getMetrics();
  assert.equal(metrics.requestCount, 20, 'window is capped at 20');
  assert.equal(metrics.errorCount, 5);
});

test('getMetrics on an empty window returns zeros, not NaN', () => {
  delete require.cache[require.resolve('../src/metricsState')];
  const { getMetrics } = require('../src/metricsState');

  const metrics = getMetrics();
  assert.equal(metrics.requestCount, 0);
  assert.equal(metrics.errorCount, 0);
  assert.equal(metrics.p95LatencyMs, 0);
});
