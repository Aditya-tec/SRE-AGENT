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

const MIN_INTERVAL_MS = 2000;
const MAX_INTERVAL_MS = 4000;

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

async function fireOrder(port) {
  try {
    await fetch(`http://localhost:${port}/gateway/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(randomOrder()),
    });
  } catch (err) {
    // Synthetic traffic failing is expected during an active incident —
    // it's what feeds the anomaly detector, not something to alarm on.
  } finally {
    scheduleNext(port);
  }
}

// Runs as a setInterval-style loop inside the control-plane process
// itself so anomaly detection always has real request volume to
// measure against, without needing a separate Render service.
function start(port) {
  scheduleNext(port);
  console.log('[traffic-generator] started, firing synthetic orders through /gateway/orders every 2-4s');
}

module.exports = { start };
