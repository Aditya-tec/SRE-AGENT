const test = require('node:test');
const assert = require('node:assert/strict');

function freshDetector() {
  delete require.cache[require.resolve('../src/detector')];
  return require('../src/detector');
}

test('detectAnomaly: null metrics means unreachable, critical severity', () => {
  const { detectAnomaly } = freshDetector();
  assert.deepEqual(detectAnomaly(null), { anomaly: true, reason: 'unreachable', severity: 'critical' });
});

test('detectAnomaly: error rate over 30% trips high_error_rate', () => {
  const { detectAnomaly } = freshDetector();
  assert.deepEqual(detectAnomaly({ requestCount: 10, errorCount: 4, p95LatencyMs: 50 }), {
    anomaly: true,
    reason: 'high_error_rate',
    severity: 'high',
  });
});

test('detectAnomaly: p95 over 1500ms trips high_latency', () => {
  const { detectAnomaly } = freshDetector();
  assert.deepEqual(detectAnomaly({ requestCount: 10, errorCount: 0, p95LatencyMs: 2000 }), {
    anomaly: true,
    reason: 'high_latency',
    severity: 'medium',
  });
});

test('detectAnomaly: healthy metrics report no anomaly', () => {
  const { detectAnomaly } = freshDetector();
  assert.deepEqual(detectAnomaly({ requestCount: 10, errorCount: 0, p95LatencyMs: 50 }), { anomaly: false });
});

test('detectAnomaly: zero requests does not divide by zero into a false positive', () => {
  const { detectAnomaly } = freshDetector();
  assert.deepEqual(detectAnomaly({ requestCount: 0, errorCount: 0, p95LatencyMs: 0 }), { anomaly: false });
});

test('evaluate: debounces — an anomaly must persist 2 cycles before "detected"', () => {
  const { evaluate } = freshDetector();

  const cycle1 = evaluate('svc-x', null);
  assert.equal(cycle1.state, 'suspected');

  const cycle2 = evaluate('svc-x', null);
  assert.equal(cycle2.state, 'detected');
  assert.equal(cycle2.faultType, 'crash');
});

test('evaluate: a healthy poll resets the debounce counter', () => {
  const { evaluate } = freshDetector();

  evaluate('svc-y', null); // suspected, count=1
  evaluate('svc-y', { requestCount: 10, errorCount: 0, p95LatencyMs: 50 }); // healthy, resets
  const afterReset = evaluate('svc-y', null); // count=1 again, not 2
  assert.equal(afterReset.state, 'suspected');
});

test('resetDebounce forces a fresh 2-cycle debounce even if the anomaly never actually cleared', () => {
  const { evaluate, resetDebounce } = freshDetector();

  evaluate('svc-z', null); // suspected, count=1
  const detected = evaluate('svc-z', null); // count=2 -> detected
  assert.equal(detected.state, 'detected');

  // Simulates resolveIncident() calling this once an incident closes
  // (Resolved or Unresolved) while the underlying fault is still
  // active — without it, the very next poll would instantly re-detect
  // and reopen a new incident since the counter never dropped.
  resetDebounce('svc-z');

  const afterReset = evaluate('svc-z', null);
  assert.equal(afterReset.state, 'suspected', 'should require a fresh debounce, not reopen instantly');
});

test('evaluate: maps each anomaly reason to the matching fault_type', () => {
  const { evaluate } = freshDetector();

  evaluate('svc-error', { requestCount: 10, errorCount: 5, p95LatencyMs: 10 });
  const errorDetected = evaluate('svc-error', { requestCount: 10, errorCount: 5, p95LatencyMs: 10 });
  assert.equal(errorDetected.faultType, 'error_rate');

  evaluate('svc-latency', { requestCount: 10, errorCount: 0, p95LatencyMs: 2000 });
  const latencyDetected = evaluate('svc-latency', { requestCount: 10, errorCount: 0, p95LatencyMs: 2000 });
  assert.equal(latencyDetected.faultType, 'latency');
});

test('evaluate: debounce state is tracked independently per service', () => {
  const { evaluate } = freshDetector();

  evaluate('svc-a', null);
  const bCycle1 = evaluate('svc-b', null);
  assert.equal(bCycle1.state, 'suspected', 'svc-b should not inherit svc-a\'s count');
});
