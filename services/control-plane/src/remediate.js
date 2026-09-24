const db = require('./db');
const gatewayState = require('./gatewayState');

const MAX_ATTEMPTS = 3;
const RENDER_API_BASE = 'https://api.render.com/v1';

// ponytail: in-memory idempotency; lost on restart (fine — retries are
// same-process duplicates from the poller / upstream caller, not cross-boot).
const priorResults = new Map();

let RENDER_SERVICE_IDS = {};
try {
  RENDER_SERVICE_IDS = JSON.parse(process.env.RENDER_SERVICE_IDS || '{}');
} catch (err) {
  console.error('[remediate] RENDER_SERVICE_IDS is not valid JSON, restarts will fail:', err.message);
}

function idempotencyKey(incidentId, attemptNumber) {
  return `${incidentId}:${attemptNumber}`;
}

async function callRenderRestart(serviceName) {
  const serviceId = RENDER_SERVICE_IDS[serviceName];
  if (!serviceId || !process.env.RENDER_API_KEY) {
    throw new Error(`no Render service id / API key configured for ${serviceName}`);
  }

  const res = await fetch(`${RENDER_API_BASE}/services/${serviceId}/restart`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RENDER_API_KEY}` },
  });

  if (!res.ok) {
    throw new Error(`Render restart API returned ${res.status}`);
  }
}

// Whitelisted, idempotent actions only — no data deletion, no scaling
// down. Safe to call against an already-healthy service.
async function executeAction(action, serviceName) {
  switch (action) {
    case 'restart':
      await callRenderRestart(serviceName);
      return;

    case 'traffic_shift': {
      if (!serviceName.startsWith('order-service')) {
        throw new Error('traffic_shift is only valid for order-service replicas');
      }
      const next = gatewayState.getActiveReplica() === 'a' ? 'b' : 'a';
      gatewayState.setActiveReplica(next);
      return;
    }

    case 'rate_limit':
      gatewayState.setRateLimit(serviceName, 0.5);
      return;

    case 'monitor':
      return;

    default:
      throw new Error(`unknown remediation action: ${action}`);
  }
}

async function remediate(incident, action, attemptNumber = 1) {
  const key = idempotencyKey(incident.id, attemptNumber);
  if (priorResults.has(key)) {
    console.log(`[remediate] idempotent skip for ${key} — returning prior result`);
    return priorResults.get(key);
  }

  let result;
  if (action === 'monitor') {
    console.log(`[remediate] incident ${incident.id}: monitoring only (attempt ${attemptNumber})`);
    result = { success: true, action: 'monitor' };
  } else {
    // Log the action BEFORE execution — an audit trail must exist even if
    // the action itself fails. A DB write failure here must not abort
    // remediation uncaught: that would leave the incident's in-memory
    // tracking (and the chaos lock) permanently stuck, since only
    // resolveIncident() ever clears either.
    try {
      await db.updateIncident(incident.id, { remediation_action: action });
    } catch (err) {
      console.error(`[remediate] incident ${incident.id}: failed to record remediation_action:`, err.message);
    }

    try {
      await executeAction(action, incident.service_name);
      console.log(`[remediate] incident ${incident.id}: ${action} succeeded on ${incident.service_name}`);
      result = { success: true, action };
    } catch (err) {
      console.error(`[remediate] incident ${incident.id}: ${action} failed:`, err.message);
      result = { success: false, action, error: err.message };
    }
  }

  priorResults.set(key, result);
  return result;
}

function clearRateLimitFor(serviceName) {
  gatewayState.clearRateLimit(serviceName);
}

module.exports = { remediate, clearRateLimitFor, MAX_ATTEMPTS };
