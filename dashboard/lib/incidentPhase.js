// Incident rows don't store an explicit "current phase" — it's derived
// from which timestamps are set, matching the state machine in the
// control plane's poller.js (Detected -> Diagnosing -> Remediating ->
// Verifying -> Resolved / Unresolved).
export function getIncidentPhase(incident) {
  if (incident.resolved_at) {
    return incident.remediation_success ? 'resolved' : 'unresolved';
  }
  if (incident.remediated_at) return 'verifying';
  if (incident.diagnosed_at) return 'remediating';
  return 'diagnosing';
}

export const PHASE_LABELS = {
  diagnosing: 'Diagnosing',
  remediating: 'Remediating',
  verifying: 'Verifying',
  resolved: 'Resolved',
  unresolved: 'Unresolved',
};

export const PHASE_TONE = {
  diagnosing: 'warning',
  remediating: 'warning',
  verifying: 'warning',
  resolved: 'good',
  unresolved: 'critical',
};
