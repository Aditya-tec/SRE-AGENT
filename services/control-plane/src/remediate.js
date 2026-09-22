const db = require('./db');
const gatewayState = require('./gatewayState');

const MAX_ATTEMPTS = 3;
const RENDER_API_BASE = 'https://api.render.com/v1';

let RENDER_SERVICE_IDS = {};
try {
  RENDER_SERVICE_IDS = JSON.parse(process.env.RENDER_SERVICE_IDS || '{}');
} catch (err) {
  console.error('[remediate] RENDER_SERVICE_IDS is not valid JSON, restarts will fail:', err.message);
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

async function remediate(incident, action) {
  if (action === 'monitor') {
    console.log(`[remediate] incident ${incident.id}: low-confidence diagnosis, monitoring only`);
    return { success: true, action: 'monitor' };
  }

  // Log the action BEFORE execution — an audit trail must exist even if
  // the action itself fails.
  await db.updateIncident(incident.id, { remediation_action: action });

  try {
    await executeAction(action, incident.service_name);
    console.log(`[remediate] incident ${incident.id}: ${action} succeeded on ${incident.service_name}`);
    return { success: true, action };
  } catch (err) {
    console.error(`[remediate] incident ${incident.id}: ${action} failed:`, err.message);
    return { success: false, action, error: err.message };
  }
}

function clearRateLimitFor(serviceName) {
  gatewayState.clearRateLimit(serviceName);
}

module.exports = { remediate, clearRateLimitFor, MAX_ATTEMPTS };
