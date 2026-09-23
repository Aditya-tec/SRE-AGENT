const test = require('node:test');
const assert = require('node:assert/strict');

function freshApp() {
  for (const mod of ['../src/app', '../src/routes/notify', '../src/chaosState', '../src/metricsState']) {
    delete require.cache[require.resolve(mod)];
  }
  return require('../src/app').createApp();
}

async function withApp(run) {
  const app = freshApp();
  const server = app.listen(0);
  server.unref();
  const { port } = server.address();
  try {
    await run(`http://localhost:${port}`);
  } finally {
    server.close();
  }
}

test('POST /notify succeeds with a valid body', async () => {
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'ord_1234', message: 'Your order is confirmed' }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { sent: true, channel: 'email' });
  });
});

test('POST /notify returns 400 when orderId or message is missing', async () => {
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'ord_1234' }),
    });
    assert.equal(res.status, 400);
  });
});
