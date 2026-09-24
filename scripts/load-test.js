// Fires N simultaneous POST /break-it calls at a running control-plane
// and checks that the chaos-in-progress lock (and, if the rate limiter
// is also at its default, the rate limiter) reject the excess
// concurrent requests cleanly instead of the server erroring or a
// second incident getting triggered. Run against `npm run dev:all`.
//
// Usage: node scripts/load-test.js [connections] [durationSec]
const autocannon = require('autocannon');

const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || 'http://localhost:3000';
const connections = Number(process.argv[2]) || 10;
const duration = Number(process.argv[3]) || 2;

async function main() {
  console.log(
    `Firing ${connections} concurrent POST /break-it against ${CONTROL_PLANE_URL} for ${duration}s...`
  );

  const result = await autocannon({
    url: `${CONTROL_PLANE_URL}/break-it`,
    connections,
    duration,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ service: 'inventory-service', faultType: 'latency' }),
  });

  const statusCounts = {};
  const stats = result.statusCodeStats || {};
  for (const [code, info] of Object.entries(stats)) {
    statusCounts[code] = info.count;
  }

  console.log('\nStatus code breakdown:', JSON.stringify(statusCounts, null, 2));

  const twoxx = Object.entries(statusCounts)
    .filter(([code]) => code.startsWith('2'))
    .reduce((sum, [, count]) => sum + count, 0);
  const fivexx = Object.entries(statusCounts)
    .filter(([code]) => code.startsWith('5'))
    .reduce((sum, [, count]) => sum + count, 0);
  const nonSuccess = Object.entries(statusCounts)
    .filter(([code]) => code.startsWith('4'))
    .reduce((sum, [, count]) => sum + count, 0);

  console.log(`\n2xx (accepted): ${twoxx}`);
  console.log(`4xx (rejected — lock/rate-limit doing its job): ${nonSuccess}`);
  console.log(`5xx (server errors — should be zero): ${fivexx}`);

  const pass = fivexx === 0 && twoxx <= 1;
  console.log(
    pass
      ? '\nPASS: at most one request was accepted and nothing 500\'d — the lock/rate-limiter held under concurrent load.'
      : '\nFAIL: either more than one request was accepted concurrently, or the server errored — investigate.'
  );
  process.exitCode = pass ? 0 : 1;
}

main().catch((err) => {
  console.error('load test failed to run:', err.message);
  console.error('Is the control plane running? Try `npm run dev:all` first.');
  process.exit(1);
});
