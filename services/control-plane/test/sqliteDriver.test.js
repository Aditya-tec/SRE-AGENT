process.env.SQLITE_PATH = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');

function freshDriver() {
  delete require.cache[require.resolve('../src/db/sqliteDriver')];
  return require('../src/db/sqliteDriver');
}

test('upsertService inserts a new row with defaults for omitted fields', async () => {
  const db = freshDriver();
  await db.upsertService('inventory-service', { status: 'healthy' });
  const services = await db.listServices();
  assert.deepEqual(services, [
    { name: 'inventory-service', status: 'healthy', last_seen_at: null, last_latency_ms: null, last_error_rate: null },
  ]);
});

test('upsertService only SETs the columns present in the payload, matching Supabase upsert semantics', async () => {
  const db = freshDriver();
  await db.upsertService('order-service-a', {
    status: 'healthy',
    last_seen_at: '2026-01-01T00:00:00.000Z',
    last_latency_ms: 42,
    last_error_rate: 0,
  });

  // The poller omits last_seen_at/last_latency_ms/last_error_rate when a
  // service is unreachable — those must survive untouched, not go null.
  await db.upsertService('order-service-a', { status: 'down' });

  const [service] = await db.listServices();
  assert.equal(service.status, 'down');
  assert.equal(service.last_seen_at, '2026-01-01T00:00:00.000Z');
  assert.equal(service.last_latency_ms, 42);
  assert.equal(service.last_error_rate, 0);
});

test('insertIncident round-trips booleans and JSON context correctly', async () => {
  const db = freshDriver();
  await db.upsertService('inventory-service', { status: 'degraded' });

  const incident = await db.insertIncident({
    service_name: 'inventory-service',
    trigger_type: 'manual',
    fault_type: 'error_rate',
    detected_at: '2026-01-01T00:00:00.000Z',
  });

  assert.match(incident.id, /^[0-9a-f-]{36}$/, 'id should be a generated uuid string');
  assert.equal(incident.service_name, 'inventory-service');
  assert.equal(incident.remediation_success, null, 'unset boolean should read back as null, not 0/false');
  assert.equal(incident.raw_context, null);

  const updated = await db.updateIncident(incident.id, {
    root_cause: 'high error rate',
    raw_context: { affectedService: 'inventory-service', recentMetrics: { a: [1, 2, 3] } },
    remediation_success: true,
  });

  assert.equal(updated.root_cause, 'high error rate');
  assert.equal(updated.remediation_success, true, 'should read back as a real boolean, not 1');
  assert.deepEqual(updated.raw_context, { affectedService: 'inventory-service', recentMetrics: { a: [1, 2, 3] } });

  const fetched = await db.getIncident(incident.id);
  assert.equal(fetched.remediation_success, true);
  assert.deepEqual(fetched.raw_context, { affectedService: 'inventory-service', recentMetrics: { a: [1, 2, 3] } });

  const updatedFalse = await db.updateIncident(incident.id, { remediation_success: false });
  assert.equal(updatedFalse.remediation_success, false, 'false must round-trip as false, not null');
});

test('getUnresolvedIncident finds an open incident and ignores resolved ones', async () => {
  const db = freshDriver();
  await db.upsertService('notification-service', { status: 'healthy' });

  const incident = await db.insertIncident({
    service_name: 'notification-service',
    trigger_type: 'manual',
    fault_type: 'crash',
    detected_at: '2026-01-01T00:00:00.000Z',
  });

  const open = await db.getUnresolvedIncident('notification-service');
  assert.equal(open.id, incident.id);

  await db.updateIncident(incident.id, { resolved_at: '2026-01-01T00:01:00.000Z', remediation_success: true });
  const afterResolve = await db.getUnresolvedIncident('notification-service');
  assert.equal(afterResolve, null);
});

test('listIncidents orders newest-first and respects limit', async () => {
  const db = freshDriver();
  await db.upsertService('order-service-a', { status: 'healthy' });

  for (let i = 0; i < 5; i++) {
    await db.insertIncident({
      service_name: 'order-service-a',
      trigger_type: 'manual',
      fault_type: 'crash',
      detected_at: `2026-01-0${i + 1}T00:00:00.000Z`,
    });
  }

  const all = await db.listIncidents(20);
  assert.equal(all.length, 5);
  assert.equal(all[0].detected_at, '2026-01-05T00:00:00.000Z', 'newest first');

  const limited = await db.listIncidents(2);
  assert.equal(limited.length, 2);
});

test('getRecentSnapshots orders newest-first and respects limit, scoped to one service', async () => {
  const db = freshDriver();
  for (let i = 0; i < 3; i++) {
    await db.insertMetricsSnapshot({
      service_name: 'inventory-service',
      request_count: 10,
      error_count: 0,
      p95_latency_ms: 20 + i,
      status: 'healthy',
    });
  }
  await db.insertMetricsSnapshot({
    service_name: 'notification-service',
    request_count: 5,
    error_count: 0,
    p95_latency_ms: 10,
    status: 'healthy',
  });

  const snapshots = await db.getRecentSnapshots('inventory-service', 2);
  assert.equal(snapshots.length, 2);
  assert.ok(snapshots.every((s) => s.service_name === 'inventory-service'));
});

test('deleteOldSnapshots removes only rows older than 24h', async () => {
  const db = freshDriver();
  const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const recent = new Date().toISOString();

  // insertMetricsSnapshot defaults recorded_at to now but an explicit
  // value in the payload overrides it — used here to backdate a row.
  await db.insertMetricsSnapshot({ service_name: 'inventory-service', recorded_at: old, request_count: 1, error_count: 0, p95_latency_ms: 10, status: 'healthy' });
  await db.insertMetricsSnapshot({ service_name: 'inventory-service', recorded_at: recent, request_count: 2, error_count: 0, p95_latency_ms: 20, status: 'healthy' });

  const before = await db.getRecentSnapshots('inventory-service', 10);
  assert.equal(before.length, 2);

  await db.deleteOldSnapshots();
  const after = await db.getRecentSnapshots('inventory-service', 10);
  assert.equal(after.length, 1, 'only the 25h-old row should have been pruned');
  assert.equal(after[0].recorded_at, recent);
});
