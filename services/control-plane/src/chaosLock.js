// A single system-wide lock so at most one chaos-triggered incident is
// ever "in flight" at a time. Acquired the moment /break-it actually
// injects a fault; released once the poller resolves the resulting
// incident (Resolved or Unresolved). A timeout-based safety net
// releases it regardless if no incident ever opens (e.g. a fault
// whose duration is too short for the 2-cycle debounce to catch it),
// so a lock can never get stuck forever.
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

let locked = false;
let safetyTimer = null;

function acquire() {
  locked = true;
  if (safetyTimer) clearTimeout(safetyTimer);
  safetyTimer = setTimeout(release, LOCK_TIMEOUT_MS);
}

function release() {
  locked = false;
  if (safetyTimer) {
    clearTimeout(safetyTimer);
    safetyTimer = null;
  }
}

function isLocked() {
  return locked;
}

module.exports = { acquire, release, isLocked };
