import Link from 'next/link';
import StatusBadge from './StatusBadge';
import { getIncidentPhase, PHASE_LABELS, PHASE_TONE } from '../lib/incidentPhase';
import { formatTimestamp } from '../lib/format';

export default function IncidentTimeline({ incidents }) {
  if (incidents.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-ink-muted">
        No incidents yet. Click &ldquo;Break It&rdquo; above to trigger one.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
            <th className="px-4 py-2 font-medium">Service</th>
            <th className="px-4 py-2 font-medium">Fault</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Trigger</th>
            <th className="px-4 py-2 font-medium">Detected</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((incident) => {
            const phase = getIncidentPhase(incident);
            return (
              <tr key={incident.id} className="border-b border-border last:border-0 hover:bg-white/5">
                <td className="px-4 py-3">
                  <Link href={`/incidents/${incident.id}`} className="font-mono text-ink-primary hover:text-accent">
                    {incident.service_name}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-ink-secondary">{incident.fault_type}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge tone={PHASE_TONE[phase]} label={PHASE_LABELS[phase]} />
                    {incident.is_flapping && <StatusBadge tone="warning" label="Flapping" />}
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-secondary">{incident.trigger_type}</td>
                <td className="px-4 py-3 font-mono text-ink-muted">{formatTimestamp(incident.detected_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
