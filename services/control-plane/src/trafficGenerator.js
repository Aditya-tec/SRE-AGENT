const ITEMS = [
  'blue-mug',
  'red-mug',
  't-shirt-m',
  't-shirt-l',
  'sticker-pack',
  'notebook',
  'water-bottle',
  'tote-bag',
  'hoodie',
  'cap',
];

// Originally 2-4s. At that rate a 30s fault only sees ~8-10 requests
// pass through before its own timer clears it — nowhere near enough
// for a 30%-error-rate threshold (or a p95 threshold, pre-fix) to
// reliably register against the metrics window, chaos randomness
// included. 1-2s gives a fault enough volume to actually be visible
// in the numbers, while still reading as "occasional demo traffic"
// rather than a load test.
const MIN_INTERVAL_MS = 1000;
const MAX_INTERVAL_MS = 2000;

function randomOrder() {
  return {
    item: ITEMS[Math.floor(Math.random() * ITEMS.length)],
    quantity: 1 + Math.floor(Math.random() * 3),
  };
}

function scheduleNext(port) {
  const delay = MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
  setTimeout(() => fireOrder(port), delay);
}

// Deliberately fire-and-forget, not awaited before scheduling the next
// request: a latency fault can hold a single request open for
// 3.5-5s, and if scheduleNext() waited for that response first, the
// generator would self-throttle to roughly one request per fault
// duration — starving exactly the anomaly (a latency spike) it exists
// to make detectable. Real traffic doesn't queue behind one slow
// request either.
function fireOrder(port) {
  fetch(`http://localhost:${port}/gateway/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(randomOrder()),
  }).catch(() => {
    // Synthetic traffic failing is expected during an active incident —
    // it's what feeds the anomaly detector, not something to alarm on.
  });
  scheduleNext(port);
}

// Runs as a setInterval-style loop inside the control-plane process
// itself so anomaly detection always has real request volume to
// measure against, without needing a separate Render service.
function start(port) {
  scheduleNext(port);
  console.log('[traffic-generator] started, firing synthetic orders through /gateway/orders every 1-2s');
}

module.exports = { start };
