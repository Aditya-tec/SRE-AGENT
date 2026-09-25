const LEVEL_LABELS = { high: 'Felt sure', medium: 'Somewhat sure', low: 'Not sure' };

export default function ConfidenceCalibration({ report }) {
  if (!report) return null;

  const levels = ['high', 'medium', 'low'];
  const hasAnyData = levels.some((level) => report[level]?.total > 0);
  if (!hasAnyData) {
    return (
      <div className="panel px-5 py-8 text-center text-sm text-ink-muted">
        This fills in after the agent has found and fixed a few problems.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {levels.map((level) => {
        const stats = report[level] || { total: 0, resolved: 0, succeeded: 0, successRate: null };
        const rate = stats.successRate != null ? stats.successRate * 100 : null;
        return (
          <div key={level} className="panel p-4">
            <div className="section-label">{LEVEL_LABELS[level]}</div>
            <div className="mt-2 font-mono text-2xl font-medium tracking-tight text-ink-primary">
              {rate != null ? `${rate.toFixed(0)}%` : '—'}
            </div>
            {rate != null && (
              <div className="mt-2 h-1 overflow-hidden rounded-sm bg-white/[0.06]">
                <div
                  className="h-full bg-accent transition-[width] duration-500"
                  style={{ width: `${Math.min(100, rate)}%` }}
                />
              </div>
            )}
            <p className="mt-2 text-sm text-ink-muted">
              {stats.succeeded} of {stats.resolved} fixes worked
              {stats.total > stats.resolved ? ` · ${stats.total - stats.resolved} still open` : ''}
            </p>
          </div>
        );
      })}
    </div>
  );
}
