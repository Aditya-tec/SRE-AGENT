function avgMs(incidents, startKey, endKey) {
  const durations = incidents
    .filter((i) => i[startKey] && i[endKey])
    .map((i) => new Date(i[endKey]) - new Date(i[startKey]));
  if (durations.length === 0) return null;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

export default function MetricsSummary({ incidents }) {
  // Labeled "Avg diagnose time", not "MTTD": the incident record has no
  // timestamp for when a fault actually began (chaos injection is
  // fire-and-forget and real degradations have no known onset either),
  // so there's no reliable "time to detect" to compute. detected_at ->
  // diagnosed_at is genuinely useful (and, with the no-GROQ fallback
  // path, genuinely near-zero) — it just isn't MTTD, and labeling it
  // that would misrepresent what the agent is actually doing here.
  const avgDiagnoseMs = avgMs(incidents, 'detected_at', 'diagnosed_at');
  const avgMttrMs = avgMs(incidents, 'detected_at', 'resolved_at');
  const resolvedCount = incidents.filter((i) => i.resolved_at).length;
  const successCount = incidents.filter((i) => i.remediation_success === true).length;
  const successRate = resolvedCount > 0 ? (successCount / resolvedCount) * 100 : null;

  const tiles = [
    { label: 'Avg diagnose time', value: avgDiagnoseMs != null ? `${(avgDiagnoseMs / 1000).toFixed(1)}s` : '—' },
    { label: 'Avg MTTR', value: avgMttrMs != null ? `${(avgMttrMs / 1000).toFixed(1)}s` : '—' },
    { label: 'Auto-resolved', value: successRate != null ? `${successRate.toFixed(0)}%` : '—' },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-lg border border-border bg-surface p-5">
          <div className="text-xs uppercase tracking-wide text-ink-muted">{tile.label}</div>
          <div className="mt-2 font-mono text-3xl text-ink-primary">{tile.value}</div>
        </div>
      ))}
    </div>
  );
}
