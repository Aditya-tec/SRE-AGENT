// Runs the named multi-step chaos scenarios (see SCENARIOS in
// services/control-plane/src/routes/breakIt.js) back-to-back against a
// running stack and prints a single summary report at the end — a
// good "watch the agent handle a bad afternoon" demo moment, distinct
// from scripts/seed-demo.js (which seeds raw single-fault history,
// not named scenarios, and prints no summary).
const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || 'http://localhost:3000';
const MAX_WAIT_FOR_RESOLUTION_MS = 4 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;
const MAX_TRIGGER_ATTEMPTS = 20;

// Mirrors breakIt.js's SCENARIOS — the services each one touches, so
// this script knows which incidents to wait on. Kept in sync manually
// (same tradeoff seed-demo.js already makes with its own scenario
// list); there's no API to fetch this definition from the server.
const SCENARIOS = {
  'cascading-failure': ['inventory-service', 'notification-service'],
  'dual-replica-pressure': ['order-service-a', 'order-service-b'],
  'inventory-then-orders': ['inventory-service', 'order-service-a'],
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchIncidents(limit = 50) {
  const res = await fetch(`${CONTROL_PLANE_URL}/incidents?limit=${limit}`);
  if (!res.ok) return null;
  return res.json();
}

async function triggerScenario(name) {
  for (let attempt = 1; attempt <= MAX_TRIGGER_ATTEMPTS; attempt++) {
    const res = await fetch(`${CONTROL_PLANE_URL}/break-it`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: name }),
    });
    if (res.status === 202) return true;
    if (res.status === 409 || res.status === 429) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    const body = await res.json().catch(() => ({}));
    console.error(`  unexpected response ${res.status}:`, body.error || body);
    return false;
  }
  return false;
}

// Same vacuous-truth trap seed-demo.js already ran into: "nothing
// globally unresolved" is true before anything has even opened, so
// this checks for real incidents on the scenario's own services,
// detected after this scenario's own trigger time.
async function waitForScenarioResolution(services, triggeredAt, maxWaitMs) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const incidents = await fetchIncidents(50);
    if (incidents) {
      const relevant = incidents.filter(
        (i) => services.includes(i.service_name) && new Date(i.detected_at).getTime() >= triggeredAt
      );
      if (relevant.length > 0 && relevant.every((i) => i.resolved_at)) {
        return true;
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

function avgMs(incidents, startKey, endKey) {
  const durations = incidents
    .filter((i) => i[startKey] && i[endKey])
    .map((i) => new Date(i[endKey]) - new Date(i[startKey]));
  if (durations.length === 0) return null;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

function formatSec(ms) {
  return ms == null ? 'n/a' : `${(ms / 1000).toFixed(1)}s`;
}

async function main() {
  console.log(`GameDay: running ${Object.keys(SCENARIOS).length} scenarios against ${CONTROL_PLANE_URL}\n`);

  const runStart = Date.now();
  for (const [name, services] of Object.entries(SCENARIOS)) {
    console.log(`-> ${name} (${services.join(' + ')})`);
    const triggeredAt = Date.now();
    const triggered = await triggerScenario(name);
    if (!triggered) {
      console.log('   failed to trigger after retries, skipping\n');
      continue;
    }
    const resolved = await waitForScenarioResolution(services, triggeredAt, MAX_WAIT_FOR_RESOLUTION_MS);
    console.log(resolved ? '   resolved\n' : '   timed out waiting for resolution, moving on anyway\n');
  }

  // Pull everything this run touched — incidents detected at/after
  // runStart — for the summary, rather than the whole table's history.
  const incidents = (await fetchIncidents(200)) || [];
  const runIncidents = incidents.filter((i) => new Date(i.detected_at).getTime() >= runStart);
  const resolvedCount = runIncidents.filter((i) => i.resolved_at).length;
  const succeededCount = runIncidents.filter((i) => i.remediation_success === true).length;
  const successRate = resolvedCount > 0 ? (succeededCount / resolvedCount) * 100 : null;

  console.log('='.repeat(48));
  console.log('GameDay summary');
  console.log('='.repeat(48));
  console.log(`Total incidents:     ${runIncidents.length}`);
  console.log(`Resolved:            ${resolvedCount}/${runIncidents.length}`);
  console.log(`Avg diagnose time:   ${formatSec(avgMs(runIncidents, 'detected_at', 'diagnosed_at'))}`);
  console.log(`Avg MTTR:            ${formatSec(avgMs(runIncidents, 'detected_at', 'resolved_at'))}`);
  console.log(`Auto-resolved:       ${successRate != null ? `${successRate.toFixed(0)}%` : 'n/a'}`);
  console.log('='.repeat(48));
}

main().catch((err) => {
  console.error('gameday failed:', err);
  process.exit(1);
});
