const DEBOUNCE_CYCLES = 2;

const consecutiveFailures = new Map();

const FAULT_TYPE_BY_REASON = {
  unreachable: 'crash',
  high_error_rate: 'error_rate',
  high_latency: 'latency',
};

function detectAnomaly(metrics) {
  if (metrics === null) return { anomaly: true, reason: 'unreachable', severity: 'critical' };

  if (metrics.errorCount / Math.max(metrics.requestCount, 1) > 0.3) {
    return { anomaly: true, reason: 'high_error_rate', severity: 'high' };
  }

  if (metrics.p95LatencyMs > 1500) {
    return { anomaly: true, reason: 'high_latency', severity: 'medium' };
  }

  return { anomaly: false };
}

// Tracks debounce state per service and returns whether this poll cycle
// should open (or keep open) an incident. 'detected' fires once the same
// anomaly has persisted for DEBOUNCE_CYCLES consecutive polls.
function evaluate(serviceName, metrics) {
  const result = detectAnomaly(metrics);

  if (!result.anomaly) {
    consecutiveFailures.delete(serviceName);
    return { ...result, state: 'healthy' };
  }

  const count = (consecutiveFailures.get(serviceName) || 0) + 1;
  consecutiveFailures.set(serviceName, count);

  const faultType = FAULT_TYPE_BY_REASON[result.reason] || 'error_rate';

  if (count >= DEBOUNCE_CYCLES) {
    return { ...result, state: 'detected', faultType };
  }

  return { ...result, state: 'suspected', faultType };
}

module.exports = { detectAnomaly, evaluate };
