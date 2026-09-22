'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import StatusBadge from '../../../components/StatusBadge';
import { getIncident } from '../../../lib/api';
import { getIncidentPhase, PHASE_LABELS, PHASE_TONE } from '../../../lib/incidentPhase';
import { formatDuration, formatTimestamp } from '../../../lib/format';

export default function IncidentDetailPage() {
  const params = useParams();
  const [incident, setIncident] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setIncident(await getIncident(params.id));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [params.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!incident || incident.resolved_at) return;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [incident, refresh]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Back to dashboard
        </Link>
        <p className="mt-4 text-sm" style={{ color: 'var(--status-critical)' }}>
          {error}
        </p>
      </main>
    );
  }

  if (!incident) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-ink-secondary">
        Loading…
      </main>
    );
  }

  const phase = getIncidentPhase(incident);
  const mttd = formatDuration(incident.detected_at, incident.diagnosed_at);
  const mttr = formatDuration(incident.detected_at, incident.resolved_at);

  const steps = [
    { label: 'Detected', at: incident.detected_at },
    { label: 'Diagnosed', at: incident.diagnosed_at },
    { label: 'Remediated', at: incident.remediated_at },
    { label: 'Resolved', at: incident.resolved_at },
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm text-accent hover:underline">
        ← Back to dashboard
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-mono text-xl">{incident.service_name}</h1>
        <StatusBadge tone={PHASE_TONE[phase]} label={PHASE_LABELS[phase]} />
      </div>
      <p className="mt-1 text-sm text-ink-secondary">
        {incident.fault_type} fault · {incident.trigger_type} trigger
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-xs uppercase text-ink-muted">MTTD</div>
          <div className="mt-1 font-mono text-lg">{mttd}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-xs uppercase text-ink-muted">MTTR</div>
          <div className="mt-1 font-mono text-lg">{mttr}</div>
        </div>
        <div className="col-span-2 rounded-lg border border-border bg-surface p-4">
          <div className="text-xs uppercase text-ink-muted">Remediation</div>
          <div className="mt-1 font-mono text-lg">
            {incident.remediation_action || '—'}{' '}
            {incident.remediation_success != null && (
              <span style={{ color: incident.remediation_success ? 'var(--status-good)' : 'var(--status-critical)' }}>
                ({incident.remediation_success ? 'succeeded' : 'failed'})
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wide text-ink-muted">Timeline</h2>
        <ol className="mt-3 space-y-2 text-sm">
          {steps.map((step) => (
            <li key={step.label} className="flex justify-between border-b border-border pb-2 last:border-0">
              <span className={step.at ? 'text-ink-primary' : 'text-ink-muted'}>{step.label}</span>
              <span className="font-mono text-ink-secondary">{formatTimestamp(step.at)}</span>
            </li>
          ))}
        </ol>
      </div>

      {incident.root_cause && (
        <div className="mt-6 rounded-lg border p-4" style={{ borderColor: 'rgba(57,135,229,0.4)', backgroundColor: 'rgba(57,135,229,0.1)' }}>
          <h2 className="text-xs uppercase tracking-wide text-ink-muted">Root Cause</h2>
          <p className="mt-2 text-sm text-ink-primary">{incident.root_cause}</p>
        </div>
      )}

      {incident.postmortem && (
        <div className="prose prose-invert prose-sm mt-6 max-w-none rounded-lg border border-border bg-surface p-4">
          <h2 className="not-prose text-xs uppercase tracking-wide text-ink-muted">Postmortem</h2>
          <ReactMarkdown>{incident.postmortem}</ReactMarkdown>
        </div>
      )}
    </main>
  );
}
