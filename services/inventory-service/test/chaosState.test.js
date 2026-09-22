const test = require('node:test');
const assert = require('node:assert/strict');

function freshChaosState() {
  delete require.cache[require.resolve('../src/chaosState')];
  return require('../src/chaosState');
}

test('applyChaos(error_rate) auto-clears after durationSec', async () => {
  const { applyChaos, getStatus } = freshChaosState();
  applyChaos('error_rate', 0.2);
  assert.equal(getStatus().active, true);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(getStatus().active, false);
});

test('applyChaos(crash) sets no expiry', () => {
  const { applyChaos } = freshChaosState();
  assert.equal(applyChaos('crash', 30).expiresAt, null);
});

test('maybeApplyChaos(error_rate) is deterministic under a mocked Math.random', async () => {
  const { applyChaos, maybeApplyChaos } = freshChaosState();
  applyChaos('error_rate', 1);

  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    assert.deepEqual(await maybeApplyChaos(), { status: 500, body: { error: 'internal' } });
    Math.random = () => 0.99;
    assert.equal(await maybeApplyChaos(), null);
  } finally {
    Math.random = originalRandom;
  }
});
