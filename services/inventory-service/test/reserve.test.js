const test = require('node:test');
const assert = require('node:assert/strict');

function freshApp() {
  for (const mod of ['../src/app', '../src/routes/reserve', '../src/chaosState', '../src/metricsState']) {
    delete require.cache[require.resolve(mod)];
  }
  return require('../src/app').createApp();
}

async function withApp(run) {
  const app = freshApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    await run(`http://localhost:${port}`);
  } finally {
    server.close();
  }
}

test('POST /reserve decrements stock on success', async () => {
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/reserve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: 'notebook', quantity: 3 }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.reserved, true);
    assert.equal(data.remaining, 27); // seeded at 30
  });
});

test('POST /reserve returns 409 when quantity exceeds stock', async () => {
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/reserve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: 'hoodie', quantity: 999 }),
    });
    assert.equal(res.status, 409);
    const data = await res.json();
    assert.equal(data.remaining, 15); // seeded stock, untouched
  });
});

test('POST /reserve returns 404 for an unknown item', async () => {
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/reserve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: 'flying-car', quantity: 1 }),
    });
    assert.equal(res.status, 404);
  });
});

test('POST /reserve returns 400 for a non-positive or non-integer quantity', async () => {
  await withApp(async (baseUrl) => {
    for (const quantity of [0, -1, 1.5, 'two']) {
      const res = await fetch(`${baseUrl}/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: 'cap', quantity }),
      });
      assert.equal(res.status, 400, `quantity=${quantity} should be rejected`);
    }
  });
});
