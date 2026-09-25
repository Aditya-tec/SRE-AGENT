function avgMs(incidents, startKey, endKey) {
  const durations = incidents
    .filter((i) => i[startKey] && i[endKey])
    .map((i) => new Date(i[endKey]) - new Date(i[startKey]));
  if (durations.length === 0) return null;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

export default function MetricsSummary({ incidents }) {
  // Labeled as "time to find cause", not "MTTD": the incident record has no
  // timestamp for when a fault actually began (chaos injection is
  // fire-and-forget and real degradations have no known onset either),
  // so there's no reliable "time to detect" to compute. detected_at ->
  // diagnosed_at is genuinely useful — it just isn't MTTD.
  const avgDiagnoseMs = avgMs(incidents, 'detected_at', 'diagnosed_at');
  const avgMttrMs = avgMs(incidents, 'detected_at', 'resolved_at');
  const resolvedCount = incidents.filter((i) => i.resolved_at).length;
  const successCount = incidents.filter((i) => i.remediation_success === true).length;
  const successRate = resolvedCount > 0 ? (successCount / resolvedCount) * 100 : null;

  const tiles = [
    {
      label: 'Time to find the cause',
      value: avgDiagnoseMs != null ? `${(avgDiagnoseMs / 1000).toFixed(1)}s` : '—',
      hint: 'From noticing the problem to knowing why',
    },
    {
      label: 'Time to fix',
      value: avgMttrMs != null ? `${(avgMttrMs / 1000).toFixed(1)}s` : '—',
      hint: 'From noticing the problem to it being healthy again',
    },
    {
      label: 'Fixed automatically',
      value: successRate != null ? `${successRate.toFixed(0)}%` : '—',
      hint:
        resolvedCount > 0
          ? `${successCount} of ${resolvedCount} problems fixed without help`
          : 'No finished problems yet',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="panel p-4">
          <div className="section-label">{tile.label}</div>
          <div className="mt-2 font-mono text-2xl font-medium tracking-tight text-ink-primary">
            {tile.value}
          </div>
          <p className="mt-1.5 text-sm leading-snug text-ink-muted">{tile.hint}</p>
        </div>
      ))}
    </div>
  );
}
