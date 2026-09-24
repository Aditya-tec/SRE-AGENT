const LEVEL_LABELS = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };

export default function ConfidenceCalibration({ report }) {
  if (!report) return null;

  const levels = ['high', 'medium', 'low'];
  const hasAnyData = levels.some((level) => report[level]?.total > 0);
  if (!hasAnyData) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-ink-muted">
        No diagnosed incidents yet — this fills in once the agent has diagnosed and resolved a few.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {levels.map((level) => {
        const stats = report[level] || { total: 0, resolved: 0, succeeded: 0, successRate: null };
        return (
          <div key={level} className="rounded-lg border border-border bg-surface p-5">
            <div className="text-xs uppercase tracking-wide text-ink-muted">{LEVEL_LABELS[level]}</div>
            <div className="mt-2 font-mono text-3xl text-ink-primary">
              {stats.successRate != null ? `${(stats.successRate * 100).toFixed(0)}%` : '—'}
            </div>
            <div className="mt-1 text-xs text-ink-secondary">
              {stats.succeeded}/{stats.resolved} resolved auto-succeeded
              {stats.total > stats.resolved && ` · ${stats.total - stats.resolved} still open`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
