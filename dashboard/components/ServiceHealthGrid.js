import StatusBadge from './StatusBadge';

const STATUS_TONE = { healthy: 'good', degraded: 'warning', down: 'critical' };
const STATUS_LABEL = { healthy: 'Healthy', degraded: 'Degraded', down: 'Down' };

export default function ServiceHealthGrid({ services }) {
  if (services.length === 0) {
    return <div className="rounded-lg border border-border bg-surface p-6 text-sm text-ink-muted">Waiting for the control plane's first poll…</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {services.map((svc) => (
        <div key={svc.name} className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-mono text-sm text-ink-primary">{svc.name}</span>
            <StatusBadge tone={STATUS_TONE[svc.status] || 'warning'} label={STATUS_LABEL[svc.status] || svc.status} />
          </div>
          <dl className="mt-3 space-y-1 text-xs text-ink-secondary">
            <div className="flex justify-between">
              <dt>p95 latency</dt>
              <dd className="font-mono">{svc.lastLatencyMs != null ? `${svc.lastLatencyMs}ms` : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt>error rate</dt>
              <dd className="font-mono">{svc.lastErrorRate != null ? `${(svc.lastErrorRate * 100).toFixed(1)}%` : '—'}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}
