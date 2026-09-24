// A large window dilutes a real, ongoing problem against a long tail
// of past-healthy history — a 30%-error-rate threshold needs errors
// to actually dominate the window, and at realistic local traffic
// volume (a synthetic order every 2-4s), a 30s error_rate fault only
// contributes ~10-15 new requests, which a 100-request window mostly
// buries. 20 keeps the window meaningfully "recent" so a genuine
// ongoing fault is reliably visible, not statistically hidden.
const WINDOW_SIZE = 20;

const window = [];

function recordRequest(durationMs, isError) {
  window.push({ durationMs, isError });
  if (window.length > WINDOW_SIZE) window.shift();
}

function p95() {
  if (window.length === 0) return 0;
  const sorted = window.map((r) => r.durationMs).sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return sorted[idx];
}

function getMetrics() {
  return {
    requestCount: window.length,
    errorCount: window.filter((r) => r.isError).length,
    p95LatencyMs: p95(),
  };
}

module.exports = { recordRequest, getMetrics };
