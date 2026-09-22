const state = {
  active: false,
  type: null,
  severity: null,
  expiresAt: null,
};

let clearTimer = null;

function applyChaos(type, durationSec, severity) {
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }

  state.active = true;
  state.type = type;
  state.severity = severity || 'high';
  state.expiresAt = type === 'crash' ? null : new Date(Date.now() + durationSec * 1000).toISOString();

  if (type !== 'crash') {
    clearTimer = setTimeout(clearChaos, durationSec * 1000);
  }

  return { ...state };
}

function clearChaos() {
  state.active = false;
  state.type = null;
  state.severity = null;
  state.expiresAt = null;
  clearTimer = null;
}

function getStatus() {
  return { active: state.active, type: state.type, expiresAt: state.expiresAt };
}

function getState() {
  return state;
}

async function maybeApplyChaos() {
  if (!state.active) return null;

  if (state.type === 'latency') {
    const [min, max] = state.severity === 'high' ? [3500, 5000] : [2000, 3500];
    const delay = min + Math.random() * (max - min);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return null;
  }

  if (state.type === 'error_rate') {
    if (Math.random() < 0.7) {
      return { status: 500, body: { error: 'internal' } };
    }
  }

  return null;
}

module.exports = { applyChaos, clearChaos, getStatus, getState, maybeApplyChaos };
