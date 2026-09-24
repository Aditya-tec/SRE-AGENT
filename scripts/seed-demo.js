// Populates realistic incident history against a locally-running
// stack (npm run dev:all) so the dashboard isn't empty on first load.
// Goes through the real POST /break-it flow — the same path the
// dashboard's Break-It button and the scheduled GitHub Action use —
// respecting the chaos-in-progress lock rather than bypassing it, so
// this exercises the exact same code path a real visitor would.
const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || 'http://localhost:3000';
// A single-service fault typically resolves in well under a minute,
// but a latency/error_rate fault on a service other incidents call
// into (e.g. inventory-service) also triggers a downstream-symptom
// incident on its callers via correlated diagnosis — several
// incidents oscillating slightly out of phase (each on its own
// detect -> exhaust-attempts -> cooldown -> re-detect cycle, since
// "restart" can't actually fix a latency/error_rate fault locally)
// can take a few minutes to all land clear at once. This is a
// one-time setup script, not a live demo interaction, so patience
// costs nothing here.
const MAX_WAIT_FOR_RESOLUTION_MS = 4 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;
const MAX_TRIGGER_ATTEMPTS = 20;

// Full 4-service x 3-fault-type matrix — 12 scenarios, enough to
// produce a real MTTD/MTTR/success-rate spread on the dashboard.
const SCENARIOS = [
  { service: 'order-service-a', faultType: 'crash' },
  { service: 'inventory-service', faultType: 'latency' },
  { service: 'notification-service', faultType: 'error_rate' },
  { service: 'order-service-b', faultType: 'crash' },
  { service: 'inventory-service', faultType: 'error_rate' },
  { service: 'notification-service', faultType: 'latency' },
  { service: 'order-service-a', faultType: 'latency' },
  { service: 'order-service-b', faultType: 'error_rate' },
  { service: 'inventory-service', faultType: 'crash' },
  { service: 'notification-service', faultType: 'crash' },
  { service: 'order-service-a', faultType: 'error_rate' },
  { service: 'order-service-b', faultType: 'latency' },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchIncidents(limit = 20) {
  const res = await fetch(`${CONTROL_PLANE_URL}/incidents?limit=${limit}`);
  if (!res.ok) return null;
  return res.json();
}

// Waits for at least one *new* incident (detected after `triggeredAt`)
// on the target service to appear and resolve. Checking "nothing is
// globally unresolved" is a trap: it's vacuously true before anything
// has even been detected yet, which silently turned every early
// failure into a false "resolved" during development of this script.
async function waitForScenarioResolution(scenario, triggeredAt, maxWaitMs) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const incidents = await fetchIncidents(20);
    if (incidents) {
      const relevant = incidents.filter(
        (i) => i.service_name === scenario.service && new Date(i.detected_at).getTime() >= triggeredAt
      );
      if (relevant.length > 0 && relevant.every((i) => i.resolved_at)) {
        return true;
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

async function triggerScenario(scenario) {
  for (let attempt = 1; attempt <= MAX_TRIGGER_ATTEMPTS; attempt++) {
    const res = await fetch(`${CONTROL_PLANE_URL}/break-it`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scenario),
    });

    if (res.status === 202) return true;

    if (res.status === 409 || res.status === 429) {
      // Chaos lock held or rate-limited — wait and retry rather than
      // giving up, which is exactly what a real client should do.
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const body = await res.json().catch(() => ({}));
    console.error(`  unexpected response ${res.status}:`, body.error || body);
    return false;
  }
  return false;
}

async function main() {
  console.log(`Seeding demo data against ${CONTROL_PLANE_URL}`);
  console.log(`${SCENARIOS.length} scenarios queued.\n`);

  let succeeded = 0;
  for (const [i, scenario] of SCENARIOS.entries()) {
    console.log(`[${i + 1}/${SCENARIOS.length}] ${scenario.faultType} on ${scenario.service}`);

    const triggeredAt = Date.now();
    const triggered = await triggerScenario(scenario);
    if (!triggered) {
      console.log('  failed to trigger after retries, skipping\n');
      continue;
    }

    const resolved = await waitForScenarioResolution(scenario, triggeredAt, MAX_WAIT_FOR_RESOLUTION_MS);
    console.log(resolved ? '  resolved\n' : '  timed out waiting for resolution, moving on anyway\n');
    if (resolved) succeeded++;
  }

  console.log(`Done. ${succeeded}/${SCENARIOS.length} scenarios fully resolved before moving on.`);
  console.log(`Open ${process.env.DASHBOARD_URL || 'http://localhost:3006'} to see the populated dashboard.`);
}

main().catch((err) => {
  console.error('seed-demo failed:', err);
  process.exit(1);
});
