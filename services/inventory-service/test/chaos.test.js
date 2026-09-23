const test = require('node:test');
const assert = require('node:assert/strict');

function freshApp() {
  for (const mod of ['../src/app', '../src/routes/chaos', '../src/chaosState']) {
    delete require.cache[require.resolve(mod)];
  }
  return require('../src/app').createApp();
}

test('POST /chaos is open when CHAOS_SECRET is unset, gated when it is set', async () => {
  delete process.env.CHAOS_SECRET;
  let app = freshApp();
  let server = app.listen(0);
  server.unref();
  let port = server.address().port;
  try {
    const openRes = await fetch(`http://localhost:${port}/chaos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'latency', durationSec: 1 }),
    });
    assert.equal(openRes.status, 200);
  } finally {
    server.close();
  }

  process.env.CHAOS_SECRET = 's3cr3t';
  app = freshApp();
  server = app.listen(0);
  server.unref();
  port = server.address().port;
  try {
    const unauthorized = await fetch(`http://localhost:${port}/chaos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'latency', durationSec: 1 }),
    });
    assert.equal(unauthorized.status, 401);

    const authorized = await fetch(`http://localhost:${port}/chaos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-chaos-secret': 's3cr3t' },
      body: JSON.stringify({ type: 'latency', durationSec: 1 }),
    });
    assert.equal(authorized.status, 200);
  } finally {
    server.close();
    delete process.env.CHAOS_SECRET;
  }
});
