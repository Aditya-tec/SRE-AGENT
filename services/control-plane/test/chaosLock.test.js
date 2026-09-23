const test = require('node:test');
const assert = require('node:assert/strict');

function freshChaosLock() {
  delete require.cache[require.resolve('../src/chaosLock')];
  return require('../src/chaosLock');
}

test('starts unlocked, acquire locks, release unlocks', () => {
  const lock = freshChaosLock();
  assert.equal(lock.isLocked(), false);
  lock.acquire();
  assert.equal(lock.isLocked(), true);
  lock.release();
  assert.equal(lock.isLocked(), false);
});

test('acquire is idempotent and release before acquire is a no-op', () => {
  const lock = freshChaosLock();
  lock.release();
  assert.equal(lock.isLocked(), false);
  lock.acquire();
  lock.acquire();
  assert.equal(lock.isLocked(), true);
  lock.release();
});
