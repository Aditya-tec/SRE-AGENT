process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:9999';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy-test-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../src/db');
const autonomyRoute = require('../src/routes/autonomy');

function withAutonomyApp(run) {
  const app = express();
  app.use(express.json());
  app.use(autonomyRoute);
  const server = app.listen(0);
  server.unref();
  const baseUrl = `http://localhost:${server.address().port}`;
  return run(baseUrl).finally(() => {
    server.closeAllConnections();
    server.close();
  });
}

test('GET /autonomy defaults to not paused', async () => {
  const stored = new Map();
  db.getSetting = async (key) => stored.get(key) ?? null;
  db.setSetting = async (key, value) => stored.set(key, value);

  await withAutonomyApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/autonomy`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { chaosPaused: false });
  });
});

test('POST /autonomy sets and persists the pause flag, reflected by a subsequent GET', async () => {
  const stored = new Map();
  db.getSetting = async (key) => stored.get(key) ?? null;
  db.setSetting = async (key, value) => stored.set(key, value);

  await withAutonomyApp(async (baseUrl) => {
    const postRes = await fetch(`${baseUrl}/autonomy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused: true }),
    });
    assert.equal(postRes.status, 200);
    assert.deepEqual(await postRes.json(), { chaosPaused: true });

    const getRes = await fetch(`${baseUrl}/autonomy`);
    assert.deepEqual(await getRes.json(), { chaosPaused: true });
  });
});

test('POST /autonomy rejects a non-boolean paused field', async () => {
  await withAutonomyApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/autonomy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused: 'yes' }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /autonomy rejects requests without the correct ADMIN_SECRET, once one is configured', async () => {
  process.env.ADMIN_SECRET = 'super-secret';
  for (const mod of ['../src/routes/autonomy']) {
    delete require.cache[require.resolve(mod)];
  }
  const freshAutonomyRoute = require('../src/routes/autonomy');
  const app = express();
  app.use(express.json());
  app.use(freshAutonomyRoute);
  const server = app.listen(0);
  server.unref();
  const baseUrl = `http://localhost:${server.address().port}`;

  try {
    const noHeader = await fetch(`${baseUrl}/autonomy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused: true }),
    });
    assert.equal(noHeader.status, 401);

    const wrongSecret = await fetch(`${baseUrl}/autonomy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'not-it' },
      body: JSON.stringify({ paused: true }),
    });
    assert.equal(wrongSecret.status, 401);

    const stored = new Map();
    db.getSetting = async (key) => stored.get(key) ?? null;
    db.setSetting = async (key, value) => stored.set(key, value);

    const correctSecret = await fetch(`${baseUrl}/autonomy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'super-secret' },
      body: JSON.stringify({ paused: true }),
    });
    assert.equal(correctSecret.status, 200);

    // GET is unauthenticated regardless — no risk in reading the state.
    const getRes = await fetch(`${baseUrl}/autonomy`);
    assert.equal(getRes.status, 200);
  } finally {
    delete process.env.ADMIN_SECRET;
    server.closeAllConnections();
    server.close();
  }
});
