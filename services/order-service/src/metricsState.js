const WINDOW_SIZE = 100;

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
