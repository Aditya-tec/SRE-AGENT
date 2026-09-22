const test = require('node:test');
const assert = require('node:assert/strict');

function freshGatewayState() {
  delete require.cache[require.resolve('../src/gatewayState')];
  return require('../src/gatewayState');
}

test('activeReplica defaults to "a" and setActiveReplica flips it', () => {
  const gw = freshGatewayState();
  assert.equal(gw.getActiveReplica(), 'a');
  gw.setActiveReplica('b');
  assert.equal(gw.getActiveReplica(), 'b');
});

test('rate limit rejects roughly the configured fraction and can be cleared', () => {
  const gw = freshGatewayState();
  gw.setRateLimit('inventory-service', 0.5);

  const originalRandom = Math.random;
  try {
    Math.random = () => 0.1; // below 0.5 -> rejected
    assert.equal(gw.shouldRejectForRateLimit(), 'inventory-service');

    Math.random = () => 0.9; // above 0.5 -> passes
    assert.equal(gw.shouldRejectForRateLimit(), null);
  } finally {
    Math.random = originalRandom;
  }

  gw.clearRateLimit('inventory-service');
  assert.equal(gw.shouldRejectForRateLimit(), null);
});

test('no rate limit configured means requests always pass', () => {
  const gw = freshGatewayState();
  assert.equal(gw.shouldRejectForRateLimit(), null);
});
