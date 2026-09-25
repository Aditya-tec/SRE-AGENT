// Incident rows don't store an explicit "current phase" — it's derived
// from which timestamps are set, matching the state machine in the
// control plane's poller.js (Detected -> Diagnosing -> Remediating ->
// Verifying -> Resolved / Unresolved).
export function getIncidentPhase(incident) {
  if (incident.resolved_at) {
    return incident.remediation_success ? 'resolved' : 'unresolved';
  }
  if (incident.remediated_at) return 'verifying';
  if (incident.awaiting_approval) return 'awaiting_approval';
  if (incident.diagnosed_at) return 'remediating';
  return 'diagnosing';
}

export const PHASE_LABELS = {
  diagnosing: 'Finding the cause',
  remediating: 'Fixing',
  verifying: 'Checking the fix',
  awaiting_approval: 'Needs approval',
  resolved: 'Fixed',
  unresolved: 'Could not fix',
};

export const PHASE_TONE = {
  diagnosing: 'warning',
  remediating: 'warning',
  verifying: 'warning',
  awaiting_approval: 'serious',
  resolved: 'good',
  unresolved: 'critical',
};
