const WINDOW_SIZE = 100;

const state = {
  requestCount: 0,
  errorCount: 0,
  durations: [],
};

function recordRequest(durationMs, isError) {
  state.requestCount += 1;
  if (isError) state.errorCount += 1;
  state.durations.push(durationMs);
  if (state.durations.length > WINDOW_SIZE) state.durations.shift();
}

function p95() {
  if (state.durations.length === 0) return 0;
  const sorted = [...state.durations].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return sorted[idx];
}

function getMetrics() {
  return {
    requestCount: state.requestCount,
    errorCount: state.errorCount,
    p95LatencyMs: p95(),
  };
}

module.exports = { recordRequest, getMetrics };
