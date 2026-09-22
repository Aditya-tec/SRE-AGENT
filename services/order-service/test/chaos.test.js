const test = require('node:test');
const assert = require('node:assert/strict');

function freshApp() {
  for (const mod of ['../src/app', '../src/routes/chaos', '../src/chaosState']) {
    delete require.cache[require.resolve(mod)];
  }
  return require('../src/app').createApp();
}

test('POST /chaos rejects an invalid fault type', async () => {
  delete process.env.CHAOS_SECRET;
  const app = freshApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://localhost:${port}/chaos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'nonsense' }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('POST /chaos is open when CHAOS_SECRET is unset, and rejects unauthorized callers when it is set', async () => {
  process.env.CHAOS_SECRET = 'top-secret';
  const app = freshApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const unauthorized = await fetch(`http://localhost:${port}/chaos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'latency', durationSec: 1 }),
    });
    assert.equal(unauthorized.status, 401);

    const authorized = await fetch(`http://localhost:${port}/chaos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-chaos-secret': 'top-secret' },
      body: JSON.stringify({ type: 'latency', durationSec: 1 }),
    });
    assert.equal(authorized.status, 200);
  } finally {
    server.close();
    delete process.env.CHAOS_SECRET;
  }
});

test('GET /chaos/status is always readable, even with CHAOS_SECRET set', async () => {
  process.env.CHAOS_SECRET = 'top-secret';
  const app = freshApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://localhost:${port}/chaos/status`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { active: false, type: null, expiresAt: null });
  } finally {
    server.close();
    delete process.env.CHAOS_SECRET;
  }
});
