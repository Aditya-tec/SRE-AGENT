const db = require('./db');
const detector = require('./detector');
const { diagnose, CALL_CHAIN } = require('./diagnose');
const { remediate, clearRateLimitFor, MAX_ATTEMPTS } = require('./remediate');
const { notifyDiscord } = require('./discord');
const { generatePostmortem } = require('./postmortem');
const { consumePendingTrigger } = require('./triggerContext');
const chaosLock = require('./chaosLock');

const POLL_INTERVAL_MS = 5000;
const FETCH_TIMEOUT_MS = 3000;
const VERIFY_HEALTHY_CYCLES = 2;

// A service that opens FLAPPING_THRESHOLD_COUNT+ incidents within
// FLAPPING_WINDOW_MS is tagged is_flapping — distinct from a clean
// one-off, since repeated open/resolve cycles usually mean the
// underlying problem was never actually fixed (or the fault itself is
// inherently intermittent), not that remediation is working.
const FLAPPING_WINDOW_MS = 10 * 60 * 1000;
const FLAPPING_THRESHOLD_COUNT = 3;

// Default true (unchanged auto-execute behavior) — only an explicit
// "false" pauses remediation for a human to approve via POST
// /incidents/:id/approve. Anything else set (typos included) stays
// on the safe/current side rather than silently disabling autonomy.
const AUTO_REMEDIATE = process.env.AUTO_REMEDIATE !== 'false';

const SERVICES = {
  'order-service-a': process.env.ORDER_A_URL || 'http://localhost:3001',
  'order-service-b': process.env.ORDER_B_URL || 'http://localhost:3011',
  'inventory-service': process.env.INVENTORY_URL || 'http://localhost:3002',
  'notification-service': process.env.NOTIFICATION_URL || 'http://localhost:3003',
};

// Upstream deps own the incident when several call-chain neighbors trip
// in the same window — remediate the likely root, not a downstream symptom.
const BUNDLE_PRIORITY = {
  'inventory-service': 0,
  'notification-service': 1,
  'order-service-a': 2,
  'order-service-b': 2,
};

// serviceName -> { incidentId, attempts, consecutiveHealthy }
// Tracks incidents past the Detected transition, through Remediating/
// Verifying, to Resolved or terminal-failed. Keyed by service name
// since the duplicate-incident guard already limits one open incident
// per service at a time.
const activeIncidents = new Map();

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Returns true if this service should attach to an existing call-chain
// incident rather than opening its own (correlated-diagnosis bundling).
function findOpenCallChainNeighbor(serviceName) {
  const neighbors = CALL_CHAIN[serviceName] || [];
  for (const n of neighbors) {
    if (activeIncidents.has(n)) return n;
  }
  // Symmetric: an open service that lists us as a neighbor.
  for (const openName of activeIncidents.keys()) {
    if ((CALL_CHAIN[openName] || []).includes(serviceName)) return openName;
  }
  return null;
}

async function pollService(name, baseUrl) {
  let metrics = null;
  let reachable = true;

  try {
    await Promise.all([
      fetchJson(`${baseUrl}/health`),
      (async () => {
        metrics = await fetchJson(`${baseUrl}/metrics`);
      })(),
    ]);
  } catch (err) {
    reachable = false;
  }

  const evaluation = detector.evaluate(name, metrics);
  const status = !reachable ? 'down' : evaluation.anomaly ? 'degraded' : 'healthy';

  const serviceFields = { status };
  if (reachable) {
    serviceFields.last_seen_at = new Date().toISOString();
    serviceFields.last_latency_ms = metrics.p95LatencyMs;
    serviceFields.last_error_rate = metrics.requestCount > 0 ? metrics.errorCount / metrics.requestCount : 0;
  }

  try {
    await db.upsertService(name, serviceFields);
    await db.insertMetricsSnapshot({
      service_name: name,
      request_count: metrics ? metrics.requestCount : null,
      error_count: metrics ? metrics.errorCount : null,
      p95_latency_ms: metrics ? metrics.p95LatencyMs : null,
      status,
    });
  } catch (err) {
    console.error(`[poller] db write failed for ${name}:`, err.message);
  }

  return { name, evaluation };
}

async function openIncident(serviceName, evaluation) {
  let incident;
  try {
    const existing = await db.getUnresolvedIncident(serviceName);
    if (existing) {
      // Incident already exists in the DB but not in our in-memory
      // tracker (e.g. after a control-plane restart) — pick it back up
      // in Verifying rather than diagnosing/remediating again.
      activeIncidents.set(serviceName, { incidentId: existing.id, attempts: existing.remediation_action ? 1 : 0, consecutiveHealthy: 0 });
      return;
    }

    const windowStart = new Date(Date.now() - FLAPPING_WINDOW_MS).toISOString();
    const recentCount = await db.countRecentIncidents(serviceName, windowStart);
    // recentCount is prior incidents only (this one hasn't been
    // inserted yet) — +1 counts the one about to open.
    const isFlapping = recentCount + 1 >= FLAPPING_THRESHOLD_COUNT;

    incident = await db.insertIncident({
      service_name: serviceName,
      trigger_type: consumePendingTrigger(serviceName),
      fault_type: evaluation.faultType,
      detected_at: new Date().toISOString(),
      is_flapping: isFlapping,
    });

    if (isFlapping) {
      console.log(`[poller] ${serviceName} is flapping: ${recentCount + 1} incidents within ${FLAPPING_WINDOW_MS / 60000}min`);
    }

    console.log(`[poller] state transition -> Detected: ${serviceName} (${evaluation.reason}), incident ${incident.id}`);
    await notifyDiscord(`🔴 Incident: ${serviceName} — ${evaluation.faultType}`);
  } catch (err) {
    console.error(`[poller] failed to open incident for ${serviceName}:`, err.message);
    return;
  }

  activeIncidents.set(serviceName, { incidentId: incident.id, attempts: 0, consecutiveHealthy: 0 });

  try {
    console.log(`[poller] state transition -> Diagnosing: incident ${incident.id}`);
    const diagnosis = await diagnose(incident);

    await db.updateIncident(incident.id, {
      root_cause: diagnosis.rootCause,
      raw_context: diagnosis.context,
      diagnosed_at: new Date().toISOString(),
      confidence: diagnosis.confidence,
    });

    console.log(
      `[poller] diagnosed incident ${incident.id}: "${diagnosis.rootCause}" (confidence=${diagnosis.confidence}, recommends=${diagnosis.recommendedAction})`
    );

    const tracked = activeIncidents.get(serviceName);
    if (tracked) {
      tracked.confidence = diagnosis.confidence;
      tracked.recommendedAction = diagnosis.recommendedAction;
    }

    if (!AUTO_REMEDIATE) {
      if (tracked) tracked.awaitingApproval = true;
      await db.updateIncident(incident.id, { awaiting_approval: true });
      console.log(
        `[poller] incident ${incident.id} awaiting approval (AUTO_REMEDIATE=false) — recommends ${diagnosis.recommendedAction}`
      );
      return;
    }

    // Confidence-weighted: low -> monitor first and only escalate if the
    // anomaly is still there next poll; high/medium -> act immediately.
    const initialAction =
      diagnosis.confidence === 'low' ? 'monitor' : diagnosis.recommendedAction || 'restart';
    await attemptRemediation(serviceName, { ...incident, service_name: serviceName }, initialAction);
  } catch (err) {
    console.error(`[poller] diagnosis pipeline failed for incident ${incident.id}:`, err.message);
  }
}

async function attemptRemediation(serviceName, incident, action) {
  const tracked = activeIncidents.get(serviceName);
  if (!tracked) return;

  tracked.attempts += 1;
  tracked.lastAction = action;

  console.log(`[poller] state transition -> Remediating: incident ${tracked.incidentId} (attempt ${tracked.attempts}/${MAX_ATTEMPTS}, action=${action}, confidence=${tracked.confidence || 'n/a'})`);
  await remediate(incident, action, tracked.attempts);

  try {
    await db.updateIncident(tracked.incidentId, { remediated_at: new Date().toISOString() });
  } catch (err) {
    console.error(`[poller] failed to record remediated_at for incident ${tracked.incidentId}:`, err.message);
  }

  console.log(`[poller] state transition -> Verifying: incident ${tracked.incidentId}`);
}

async function progressIncident(serviceName, evaluation) {
  const tracked = activeIncidents.get(serviceName);
  if (!tracked) return;

  if (!evaluation.anomaly) {
    tracked.consecutiveHealthy += 1;
    if (tracked.consecutiveHealthy >= VERIFY_HEALTHY_CYCLES) {
      await resolveIncident(serviceName, tracked, true);
    }
    return;
  }

  tracked.consecutiveHealthy = 0;

  if (tracked.awaitingApproval) {
    // Paused for a human decision — don't escalate or burn attempts
    // toward MAX_ATTEMPTS while waiting. approveIncident() is the only
    // path back into normal remediation from here. The service can
    // still resolve on its own above (a real recovery isn't gated).
    return;
  }

  if (tracked.attempts >= MAX_ATTEMPTS) {
    await resolveIncident(serviceName, tracked, false);
    return;
  }

  // After a low-confidence monitor pass, escalate to the recommended
  // action (or restart) only once the anomaly has persisted another cycle.
  let nextAction = tracked.lastAction || 'restart';
  if (tracked.lastAction === 'monitor') {
    nextAction =
      tracked.recommendedAction && tracked.recommendedAction !== 'monitor'
        ? tracked.recommendedAction
        : 'restart';
  }

  try {
    await attemptRemediation(serviceName, { id: tracked.incidentId, service_name: serviceName }, nextAction);
  } catch (err) {
    // An unexpected throw here (vs. remediate()'s own caught failures)
    // must not leave this incident stuck in activeIncidents forever —
    // that would also hold the chaos lock forever, since only
    // resolveIncident() ever releases it. Resolve as failed once
    // attempts are exhausted, same as the normal max-attempts path;
    // otherwise let the next poll cycle retry.
    console.error(`[poller] remediation attempt threw unexpectedly for incident ${tracked.incidentId}:`, err.message);
    if (tracked.attempts >= MAX_ATTEMPTS) {
      await resolveIncident(serviceName, tracked, false);
    }
  }
}

// Called from POST /incidents/:id/approve. Finds the in-memory tracked
// entry by incident id (activeIncidents is keyed by service name, not
// incident id, since only one incident is ever open per service) and
// runs the diagnosis's recommended action — the same escalation choice
// progressIncident would have made automatically if AUTO_REMEDIATE
// hadn't paused it.
async function approveIncident(incidentId) {
  const entry = [...activeIncidents.entries()].find(([, tracked]) => tracked.incidentId === incidentId);
  if (!entry) {
    return { ok: false, error: 'no active incident with that id' };
  }
  const [serviceName, tracked] = entry;
  if (!tracked.awaitingApproval) {
    return { ok: false, error: 'incident is not awaiting approval' };
  }

  tracked.awaitingApproval = false;
  try {
    await db.updateIncident(incidentId, { awaiting_approval: false });
  } catch (err) {
    console.error(`[poller] failed to clear awaiting_approval for incident ${incidentId}:`, err.message);
  }

  const action =
    tracked.recommendedAction && tracked.recommendedAction !== 'monitor' ? tracked.recommendedAction : 'restart';
  console.log(`[poller] incident ${incidentId} approved — executing ${action}`);
  await attemptRemediation(serviceName, { id: incidentId, service_name: serviceName }, action);
  return { ok: true };
}

async function resolveIncident(serviceName, tracked, success) {
  activeIncidents.delete(serviceName);
  clearRateLimitFor(serviceName);
  detector.resetDebounce(serviceName);

  // Release the "an incident is already being investigated" lock only
  // once nothing else is still in flight — a manual trigger and an
  // unrelated real degradation can overlap.
  if (activeIncidents.size === 0) {
    chaosLock.release();
  }

  let updated;
  try {
    updated = await db.updateIncident(tracked.incidentId, {
      resolved_at: new Date().toISOString(),
      remediation_success: success,
    });
  } catch (err) {
    console.error(`[poller] failed to mark incident ${tracked.incidentId} resolved:`, err.message);
  }

  if (success) {
    console.log(`[poller] state transition -> Resolved: incident ${tracked.incidentId} (${serviceName})`);
    await notifyDiscord(`✅ Resolved: ${serviceName} incident ${tracked.incidentId}`);
  } else {
    console.log(`[poller] state transition -> Unresolved (max attempts): incident ${tracked.incidentId} (${serviceName})`);
    await notifyDiscord(`⚠️ Unresolved after ${MAX_ATTEMPTS} attempts: ${serviceName} incident ${tracked.incidentId}`);
  }

  if (updated) {
    try {
      const postmortem = await generatePostmortem(updated);
      await db.updateIncident(tracked.incidentId, { postmortem });
      console.log(`[poller] postmortem generated for incident ${tracked.incidentId}`);
    } catch (err) {
      console.error(`[poller] postmortem generation failed for incident ${tracked.incidentId}:`, err.message);
    }
  }
}

let lastPollAt = null;
let polling = false;

async function pollAll() {
  // A slow cycle (e.g. a Groq call taking a few seconds) must not
  // overlap with the next setInterval firing — two concurrent cycles
  // touching the same service could double up a remediation attempt
  // against the same incident. Skip this tick rather than run in
  // parallel with the last one.
  if (polling) {
    console.error('[poller] previous poll cycle still running, skipping this tick');
    return;
  }
  polling = true;

  try {
    try {
      await db.deleteOldSnapshots();
    } catch (err) {
      console.error('[poller] failed to prune old snapshots:', err.message);
    }

    try {
      // Phase 1: fetch + evaluate every service in parallel (metrics only).
      // Opening incidents here used to race — two call-chain neighbors
      // confirming in the same tick each opened their own row before
      // either landed in activeIncidents.
      const results = await Promise.all(
        Object.entries(SERVICES).map(([name, url]) => pollService(name, url))
      );

      // Phase 2a: progress already-open incidents.
      for (const { name, evaluation } of results) {
        if (activeIncidents.has(name)) {
          await progressIncident(name, evaluation);
        } else if (evaluation.state === 'suspected') {
          console.log(`[poller] ${name} suspected anomaly (${evaluation.reason}), awaiting confirmation`);
        }
      }

      // Phase 2b: open at most one new incident per call-chain cluster.
      // Upstream deps win ownership so remediation targets the likely root;
      // diagnose() still pulls neighbor telemetry into that single context.
      const newlyDetected = results
        .filter(({ name, evaluation }) => !activeIncidents.has(name) && evaluation.state === 'detected')
        .sort(
          (a, b) =>
            (BUNDLE_PRIORITY[a.name] ?? 99) - (BUNDLE_PRIORITY[b.name] ?? 99)
        );

      for (const { name, evaluation } of newlyDetected) {
        const neighbor = findOpenCallChainNeighbor(name);
        if (neighbor) {
          console.log(
            `[poller] bundling ${name} anomaly into existing incident on ${neighbor} (correlated call-chain)`
          );
          continue;
        }
        await openIncident(name, evaluation);
      }
    } catch (err) {
      // A single bad tick must never silently kill the setInterval —
      // this is the "who watches the watchmen" gap: without it, a bug
      // here would go quiet with nothing external noticing.
      console.error('[poller] poll cycle failed unexpectedly:', err.message);
    }

    lastPollAt = new Date().toISOString();
  } finally {
    polling = false;
  }
}

function getLastPollAt() {
  return lastPollAt;
}

function start() {
  pollAll();
  return setInterval(pollAll, POLL_INTERVAL_MS);
}

module.exports = { start, pollAll, getLastPollAt, SERVICES, approveIncident };
