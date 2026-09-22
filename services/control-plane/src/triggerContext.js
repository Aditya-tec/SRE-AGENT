const TTL_MS = 30000;

// service_name -> { triggerType, expiresAt }
// /break-it records why a fault was injected right before calling
// /chaos; the poller consumes this the moment it actually opens the
// incident, so incidents.trigger_type reflects the real cause instead
// of a hardcoded guess.
const pending = new Map();

function recordPendingTrigger(serviceName, triggerType) {
  pending.set(serviceName, { triggerType, expiresAt: Date.now() + TTL_MS });
}

function consumePendingTrigger(serviceName) {
  const entry = pending.get(serviceName);
  if (!entry) return 'manual';
  pending.delete(serviceName);
  if (Date.now() > entry.expiresAt) return 'manual';
  return entry.triggerType;
}

module.exports = { recordPendingTrigger, consumePendingTrigger };
