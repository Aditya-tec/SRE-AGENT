import StatusBadge from './StatusBadge';

const STATUS_TONE = { healthy: 'good', degraded: 'warning', down: 'critical' };
const STATUS_LABEL = { healthy: 'Healthy', degraded: 'Slow / flaky', down: 'Down' };

export default function ServiceHealthGrid({ services }) {
  if (services.length === 0) {
    return (
      <div className="panel px-5 py-8 text-center text-sm text-ink-muted">
        Waiting for the first health check…
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {services.map((svc) => {
        const tone = STATUS_TONE[svc.status] || 'warning';
        return (
          <article key={svc.name} className="panel p-2.5 pt-3 transition hover:bg-surface-raised">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-bold text-ink-primary">{svc.name}</p>
                <p className="mt-0.5 text-xs font-medium text-ink-muted">Polled every 5s</p>
              </div>
              <StatusBadge tone={tone} label={STATUS_LABEL[svc.status] || svc.status} />
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-1.5">
              <div>
                <dt className="section-label">Latency</dt>
                <dd className="mt-0.5 font-mono text-base font-bold text-ink-primary">
                  {svc.lastLatencyMs != null ? `${svc.lastLatencyMs} ms` : '—'}
                </dd>
              </div>
              <div>
                <dt className="section-label">Error rate</dt>
                <dd className="mt-0.5 font-mono text-base font-bold text-ink-primary">
                  {svc.lastErrorRate != null ? `${(svc.lastErrorRate * 100).toFixed(1)}%` : '—'}
                </dd>
              </div>
            </dl>
          </article>
        );
      })}
    </div>
  );
}
