const db = require('./db');
const detector = require('./detector');
const { diagnose } = require('./diagnose');

const POLL_INTERVAL_MS = 5000;
const FETCH_TIMEOUT_MS = 3000;

const SERVICES = {
  'order-service-a': process.env.ORDER_A_URL || 'http://localhost:3001',
  'order-service-b': process.env.ORDER_B_URL || 'http://localhost:3011',
  'inventory-service': process.env.INVENTORY_URL || 'http://localhost:3002',
  'notification-service': process.env.NOTIFICATION_URL || 'http://localhost:3003',
};

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
    await Promise.all([fetchJson(`${baseUrl}/health`), (async () => {
      metrics = await fetchJson(`${baseUrl}/metrics`);
    })()]);
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

  if (evaluation.state === 'detected') {
    await openIncidentIfNeeded(name, evaluation);
  } else if (evaluation.state === 'suspected') {
    console.log(`[poller] ${name} suspected anomaly (${evaluation.reason}), awaiting confirmation`);
  }
}

async function openIncidentIfNeeded(serviceName, evaluation) {
  let incident;
  try {
    const existing = await db.getUnresolvedIncident(serviceName);
    if (existing) return;

    incident = await db.insertIncident({
      service_name: serviceName,
      trigger_type: 'manual',
      fault_type: evaluation.faultType,
      detected_at: new Date().toISOString(),
    });

    console.log(`[poller] state transition -> Detected: ${serviceName} (${evaluation.reason}), incident ${incident.id}`);
  } catch (err) {
    console.error(`[poller] failed to open incident for ${serviceName}:`, err.message);
    return;
  }

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
  } catch (err) {
    console.error(`[poller] diagnosis pipeline failed for incident ${incident.id}:`, err.message);
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
