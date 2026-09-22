const test = require('node:test');
const assert = require('node:assert/strict');
const { getIncidentPhase, PHASE_LABELS, PHASE_TONE } = require('../lib/incidentPhase');

test('an incident with only detected_at is diagnosing', () => {
  assert.equal(getIncidentPhase({ detected_at: '2026-01-01T00:00:00Z' }), 'diagnosing');
});

test('diagnosed but not yet remediated is remediating', () => {
  assert.equal(getIncidentPhase({ detected_at: 't0', diagnosed_at: 't1' }), 'remediating');
});

test('remediated but not resolved is verifying', () => {
  assert.equal(getIncidentPhase({ detected_at: 't0', diagnosed_at: 't1', remediated_at: 't2' }), 'verifying');
});

test('resolved with remediation_success=true is resolved', () => {
  assert.equal(
    getIncidentPhase({ detected_at: 't0', diagnosed_at: 't1', remediated_at: 't2', resolved_at: 't3', remediation_success: true }),
    'resolved'
  );
});

test('resolved with remediation_success=false is unresolved', () => {
  assert.equal(
    getIncidentPhase({ detected_at: 't0', resolved_at: 't3', remediation_success: false }),
    'unresolved'
  );
});

test('every phase has a label and a tone', () => {
  for (const phase of Object.keys(PHASE_LABELS)) {
    assert.ok(PHASE_LABELS[phase]);
    assert.ok(PHASE_TONE[phase]);
  }
});
