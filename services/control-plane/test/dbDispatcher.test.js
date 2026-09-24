const test = require('node:test');
const assert = require('node:assert/strict');

function freshDb(env) {
  const previous = { ...process.env };
  Object.assign(process.env, env);
  for (const mod of ['../src/db', '../src/db/sqliteDriver', '../src/db/supabaseDriver']) {
    delete require.cache[require.resolve(mod)];
  }
  const mod = require('../src/db');
  process.env = previous;
  return mod;
}

test('STORAGE_DRIVER=sqlite routes to the sqlite driver', () => {
  const db = freshDb({ STORAGE_DRIVER: 'sqlite', SQLITE_PATH: ':memory:' });
  assert.equal(db, require('../src/db/sqliteDriver'));
});

test('STORAGE_DRIVER unset defaults to the supabase driver (unchanged deployed behavior)', () => {
  const env = { ...process.env };
  delete env.STORAGE_DRIVER;
  env.SUPABASE_URL = 'http://localhost:9999';
  env.SUPABASE_SERVICE_KEY = 'dummy-test-key';
  const db = freshDb(env);
  assert.equal(db, require('../src/db/supabaseDriver'));
});

test('STORAGE_DRIVER=supabase (explicit) also routes to the supabase driver', () => {
  const db = freshDb({ STORAGE_DRIVER: 'supabase', SUPABASE_URL: 'http://localhost:9999', SUPABASE_SERVICE_KEY: 'dummy-test-key' });
  assert.equal(db, require('../src/db/supabaseDriver'));
});
