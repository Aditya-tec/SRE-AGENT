// A single system-wide lock so at most one chaos-triggered incident is
// ever "in flight" at a time. Acquired the moment /break-it actually
// injects a fault; released once the poller resolves the resulting
// incident (Resolved or Unresolved). A timeout-based safety net
// releases it regardless if no incident ever opens — e.g. a fault
// whose effect wasn't sustained enough to survive the 2-cycle
// debounce before it expired — so a lock can never get stuck forever.
// 120s is sized off the realistic worst case for a real incident to
// fully resolve (detect ~10s + diagnose ~10s + up to 30s of remaining
// fault duration + verify ~10s, with headroom) — long enough to never
// cut off a genuinely in-progress incident, short enough that a fault
// that silently failed to register doesn't wedge the demo for minutes.
const LOCK_TIMEOUT_MS = 120 * 1000;

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
