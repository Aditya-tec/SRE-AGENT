let activeReplica = 'a';
const rateLimits = {};

function getActiveReplica() {
  return activeReplica;
}

function setActiveReplica(replica) {
  activeReplica = replica;
}

function setRateLimit(serviceName, rejectFraction = 0.5) {
  rateLimits[serviceName] = { active: true, rejectFraction };
}

function clearRateLimit(serviceName) {
  delete rateLimits[serviceName];
}

// Returns the name of the first rate-limited service that this request
// should be rejected for, or null if it should pass through.
function shouldRejectForRateLimit() {
  for (const name of Object.keys(rateLimits)) {
    const rl = rateLimits[name];
    if (rl.active && Math.random() < rl.rejectFraction) return name;
  }
  return null;
}

module.exports = {
  getActiveReplica,
  setActiveReplica,
  setRateLimit,
  clearRateLimit,
  shouldRejectForRateLimit,
};
