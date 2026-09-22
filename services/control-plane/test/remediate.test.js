process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:9999';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy-test-key';
delete process.env.RENDER_API_KEY;
delete process.env.RENDER_SERVICE_IDS;

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const gatewayState = require('../src/gatewayState');
const { remediate } = require('../src/remediate');

function stubUpdateIncident() {
  const calls = [];
  db.updateIncident = async (id, fields) => {
    calls.push({ id, fields });
    return { id, ...fields };
  };
  return calls;
}

test('remediate("monitor") takes no action and does not touch the DB', async () => {
  const calls = stubUpdateIncident();
  const result = await remediate({ id: 'inc_1', service_name: 'inventory-service' }, 'monitor');
  assert.deepEqual(result, { success: true, action: 'monitor' });
  assert.equal(calls.length, 0);
});

test('remediate("traffic_shift") flips the active replica and only applies to order-service', async () => {
  stubUpdateIncident();
  gatewayState.setActiveReplica('a');

  const result = await remediate({ id: 'inc_2', service_name: 'order-service-a' }, 'traffic_shift');
  assert.equal(result.success, true);
  assert.equal(gatewayState.getActiveReplica(), 'b');

  const rejected = await remediate({ id: 'inc_3', service_name: 'inventory-service' }, 'traffic_shift');
  assert.equal(rejected.success, false);
  assert.match(rejected.error, /only valid for order-service/);
});

test('remediate("rate_limit") activates gateway rate limiting for the service', async () => {
  stubUpdateIncident();
  gatewayState.clearRateLimit('notification-service');

  const result = await remediate({ id: 'inc_4', service_name: 'notification-service' }, 'rate_limit');
  assert.equal(result.success, true);

  const originalRandom = Math.random;
  try {
    Math.random = () => 0.1;
    assert.equal(gatewayState.shouldRejectForRateLimit(), 'notification-service');
  } finally {
    Math.random = originalRandom;
    gatewayState.clearRateLimit('notification-service');
  }
});

test('remediate("restart") fails cleanly without RENDER_API_KEY/RENDER_SERVICE_IDS configured', async () => {
  const calls = stubUpdateIncident();
  const result = await remediate({ id: 'inc_5', service_name: 'order-service-a' }, 'restart');

  assert.equal(result.success, false);
  assert.match(result.error, /no Render service id/);
});

test('remediation_action is written to the DB before the action executes (audit trail)', async () => {
  const calls = stubUpdateIncident();
  await remediate({ id: 'inc_6', service_name: 'order-service-a' }, 'traffic_shift');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, 'inc_6');
  assert.equal(calls[0].fields.remediation_action, 'traffic_shift');
});

test('remediate rejects an action outside the whitelist', async () => {
  stubUpdateIncident();
  const result = await remediate({ id: 'inc_7', service_name: 'order-service-a' }, 'delete_everything');
  assert.equal(result.success, false);
  assert.match(result.error, /unknown remediation action/);
});
