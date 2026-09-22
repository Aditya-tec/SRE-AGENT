const db = require('./db');
const detector = require('./detector');
const { diagnose } = require('./diagnose');
const { remediate, clearRateLimitFor, MAX_ATTEMPTS } = require('./remediate');
const { notifyDiscord } = require('./discord');
const { generatePostmortem } = require('./postmortem');

const POLL_INTERVAL_MS = 5000;
const FETCH_TIMEOUT_MS = 3000;
const VERIFY_HEALTHY_CYCLES = 2;

const SERVICES = {
  'order-service-a': process.env.ORDER_A_URL || 'http://localhost:3001',
  'order-service-b': process.env.ORDER_B_URL || 'http://localhost:3011',
  'inventory-service': process.env.INVENTORY_URL || 'http://localhost:3002',
  'notification-service': process.env.NOTIFICATION_URL || 'http://localhost:3003',
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

  if (activeIncidents.has(name)) {
    await progressIncident(name, evaluation);
  } else if (evaluation.state === 'detected') {
    await openIncident(name, evaluation);
  } else if (evaluation.state === 'suspected') {
    console.log(`[poller] ${name} suspected anomaly (${evaluation.reason}), awaiting confirmation`);
  }
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

    incident = await db.insertIncident({
      service_name: serviceName,
      trigger_type: 'manual',
      fault_type: evaluation.faultType,
      detected_at: new Date().toISOString(),
    });

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
    });

    console.log(
      `[poller] diagnosed incident ${incident.id}: "${diagnosis.rootCause}" (confidence=${diagnosis.confidence}, recommends=${diagnosis.recommendedAction})`
    );

    await attemptRemediation(serviceName, { ...incident, service_name: serviceName }, diagnosis.recommendedAction);
  } catch (err) {
    console.error(`[poller] diagnosis pipeline failed for incident ${incident.id}:`, err.message);
  }
}

async function attemptRemediation(serviceName, incident, action) {
  const tracked = activeIncidents.get(serviceName);
  if (!tracked) return;

  tracked.attempts += 1;
  tracked.lastAction = action;

  console.log(`[poller] state transition -> Remediating: incident ${tracked.incidentId} (attempt ${tracked.attempts}/${MAX_ATTEMPTS}, action=${action})`);
  await remediate(incident, action);

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

  if (tracked.attempts >= MAX_ATTEMPTS) {
    await resolveIncident(serviceName, tracked, false);
    return;
  }

  await attemptRemediation(serviceName, { id: tracked.incidentId, service_name: serviceName }, tracked.lastAction || 'restart');
}

async function resolveIncident(serviceName, tracked, success) {
  activeIncidents.delete(serviceName);
  clearRateLimitFor(serviceName);

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

async function pollAll() {
  try {
    await db.deleteOldSnapshots();
  } catch (err) {
    console.error('[poller] failed to prune old snapshots:', err.message);
  }

  await Promise.all(Object.entries(SERVICES).map(([name, url]) => pollService(name, url)));
}

function start() {
  pollAll();
  return setInterval(pollAll, POLL_INTERVAL_MS);
}

module.exports = { start, pollAll, SERVICES };
