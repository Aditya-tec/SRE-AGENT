process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:9999';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy-test-key';
delete process.env.GROQ_API_KEY;

const test = require('node:test');
const assert = require('node:assert/strict');
const { generatePostmortem } = require('../src/postmortem');

test('generatePostmortem falls back to a templated summary when GROQ_API_KEY is unset', async () => {
  const incident = {
    service_name: 'inventory-service',
    fault_type: 'error_rate',
    trigger_type: 'manual',
    detected_at: '2026-09-22T16:30:00.000Z',
    diagnosed_at: '2026-09-22T16:30:03.000Z',
    remediated_at: '2026-09-22T16:30:04.000Z',
    resolved_at: '2026-09-22T16:30:15.000Z',
    root_cause: 'inventory-service error rate spiked to 65%.',
    remediation_action: 'restart',
    remediation_success: true,
  };

  const postmortem = await generatePostmortem(incident);

  assert.match(postmortem, /## Summary/);
  assert.match(postmortem, /## Root Cause/);
  assert.match(postmortem, /## Resolution/);
  assert.match(postmortem, /inventory-service error rate spiked to 65%/);
  assert.match(postmortem, /restart/);
});

test('generatePostmortem never returns empty, even with sparse incident data', async () => {
  const postmortem = await generatePostmortem({
    service_name: 'order-service-a',
    fault_type: 'crash',
    trigger_type: 'autonomous',
    detected_at: '2026-09-22T16:30:00.000Z',
  });

  assert.ok(postmortem.length > 0);
  assert.match(postmortem, /Unknown \(diagnosis unavailable\)/);
});
