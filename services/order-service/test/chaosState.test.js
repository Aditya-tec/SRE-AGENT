const test = require('node:test');
const assert = require('node:assert/strict');

function freshChaosState() {
  delete require.cache[require.resolve('../src/chaosState')];
  return require('../src/chaosState');
}

test('applyChaos(latency) sets state and an expiry, maybeApplyChaos delays but does not error', async () => {
  const { applyChaos, getStatus, maybeApplyChaos } = freshChaosState();

  const result = applyChaos('latency', 1, 'low');
  assert.equal(result.active, true);
  assert.equal(result.type, 'latency');
  assert.ok(result.expiresAt);

  const status = getStatus();
  assert.equal(status.active, true);
  assert.equal(status.type, 'latency');

  const start = Date.now();
  const outcome = await maybeApplyChaos();
  const elapsed = Date.now() - start;
  assert.equal(outcome, null, 'latency chaos delays, does not fail the request');
  assert.ok(elapsed >= 1900, `expected a 2000-3500ms delay for low severity, got ${elapsed}ms`);
});

test('applyChaos(error_rate) auto-clears after durationSec', async () => {
  const { applyChaos, getStatus } = freshChaosState();

  applyChaos('error_rate', 0.2);
  assert.equal(getStatus().active, true);

  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(getStatus().active, false, 'error_rate chaos should have auto-cleared');
});

test('applyChaos(crash) sets no expiry (external recovery only)', () => {
  const { applyChaos } = freshChaosState();
  const result = applyChaos('crash', 30);
  assert.equal(result.expiresAt, null);
});

test('maybeApplyChaos(error_rate) returns a 500 body on the unlucky branch, null on the lucky one', async () => {
  const { applyChaos, maybeApplyChaos } = freshChaosState();
  applyChaos('error_rate', 1);

  const originalRandom = Math.random;
  try {
    Math.random = () => 0; // always below the 0.7 error threshold
    const failing = await maybeApplyChaos();
    assert.deepEqual(failing, { status: 500, body: { error: 'internal' } });

    Math.random = () => 0.99; // always above it
    const passing = await maybeApplyChaos();
    assert.equal(passing, null);
  } finally {
    Math.random = originalRandom;
  }
});

test('maybeApplyChaos is a no-op when no fault is active', async () => {
  const { maybeApplyChaos } = freshChaosState();
  const outcome = await maybeApplyChaos();
  assert.equal(outcome, null);
});
