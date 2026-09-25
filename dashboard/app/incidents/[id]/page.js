'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import StatusBadge from '../../../components/StatusBadge';
import { getIncident, approveIncident } from '../../../lib/api';
import { getIncidentPhase, PHASE_LABELS, PHASE_TONE } from '../../../lib/incidentPhase';
import { formatDuration, formatTimestamp } from '../../../lib/format';

export default function IncidentDetailPage() {
  const params = useParams();
  const [incident, setIncident] = useState(null);
  const [error, setError] = useState(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState(null);

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

  async function handleApprove() {
    setApproving(true);
    setApproveError(null);
    try {
      await approveIncident(incident.id);
      await refresh();
    } catch (err) {
      setApproveError(err.message);
    } finally {
      setApproving(false);
    }
  }

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
  // Not MTTD: no timestamp for when the fault actually began exists to
  // measure detection time against. This is genuinely detect->diagnose
  // latency — see MetricsSummary.js for the fuller rationale.
  const diagnoseTime = formatDuration(incident.detected_at, incident.diagnosed_at);
  const mttr = formatDuration(incident.detected_at, incident.resolved_at);

  // resolved_at marks when the incident stopped being tracked, not
  // necessarily a recovery — the poller stamps it the same way whether
  // the incident actually resolved or the agent gave up after 3 failed
  // attempts (see poller.js's resolveIncident). Label it accordingly
  // instead of always claiming a recovery that may not have happened.
  const steps = [
    { label: 'Noticed', at: incident.detected_at },
    { label: 'Found the cause', at: incident.diagnosed_at },
    { label: 'Applied a fix', at: incident.remediated_at },
    {
      label: phase === 'unresolved' ? 'Gave up (3 attempts)' : 'Back to healthy',
      at: incident.resolved_at,
    },
  ];

  const FAULT_LABELS = {
    crash: 'Crashed',
    latency: 'Too slow',
    error_rate: 'Returning errors',
  };
  const TRIGGER_LABELS = {
    chaos: 'Break It',
    organic: 'Real traffic',
    synthetic: 'Test traffic',
    gameday: 'Game day',
  };
  const whatBroke = FAULT_LABELS[incident.fault_type] || incident.fault_type;
  const howStarted = TRIGGER_LABELS[incident.trigger_type] || incident.trigger_type;
  const diagnosisFailed = /unavailable|failed/i.test(incident.root_cause || '');

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-8">
      <Link
        href="/#incidents"
        className="inline-flex text-sm text-ink-muted transition hover:text-accent"
      >
        ← Back to problems
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold tracking-tight sm:text-xl">
            {incident.service_name}
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            {whatBroke} · started via {howStarted}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge tone={PHASE_TONE[phase]} label={PHASE_LABELS[phase]} />
          {incident.is_flapping && <StatusBadge tone="warning" label="Unstable" />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="panel p-3">
          <div className="section-label">Time to find cause</div>
          <div className="mt-1.5 font-mono text-base text-ink-primary">{diagnoseTime}</div>
        </div>
        <div className="panel p-3">
          <div className="section-label">Time to fix</div>
          <div className="mt-1.5 font-mono text-base text-ink-primary">{mttr}</div>
        </div>
        <div className="panel col-span-2 p-3">
          <div className="section-label">What the agent did</div>
          <div className="mt-1.5 font-mono text-base text-ink-primary">
            {incident.remediation_action || '—'}{' '}
            {incident.remediation_success != null && (
              <span
                style={{
                  color: incident.remediation_success
                    ? 'var(--status-good)'
                    : 'var(--status-critical)',
                }}
              >
                ({incident.remediation_success ? 'worked' : 'failed'})
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="panel p-4">
        <h2 className="section-label">What happened</h2>
        <ol className="mt-3 space-y-0">
          {steps.map((step, i) => {
            const done = Boolean(step.at);
            return (
              <li key={step.label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 rounded-full ${done ? 'bg-good' : 'bg-white/15'}`}
                    aria-hidden="true"
                  />
                  {i < steps.length - 1 && (
                    <span className={`w-px flex-1 ${done ? 'bg-good/40' : 'bg-border'}`} />
                  )}
                </div>
                <div className="flex flex-1 justify-between gap-3 pb-4">
                  <span className={done ? 'text-base text-ink-primary' : 'text-base text-ink-muted'}>
                    {step.label}
                  </span>
                  <span className="font-mono text-sm text-ink-muted">
                    {formatTimestamp(step.at)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {incident.root_cause && (
        <div className="panel relative overflow-hidden p-4">
          <span
            className="absolute inset-y-0 left-0 w-0.5"
            style={{
              backgroundColor: diagnosisFailed ? 'var(--status-critical)' : 'var(--accent)',
            }}
            aria-hidden="true"
          />
          <div className="pl-2">
            <h2 className="section-label" style={diagnosisFailed ? { color: 'var(--status-critical)' } : undefined}>
              {diagnosisFailed ? 'Diagnosis failed' : 'Why it broke'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{incident.root_cause}</p>
          </div>
        </div>
      )}

      {phase === 'awaiting_approval' && (
        <div className="panel relative overflow-hidden p-4">
          <span
            className="absolute inset-y-0 left-0 w-0.5"
            style={{ backgroundColor: 'var(--status-serious)' }}
            aria-hidden="true"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 pl-2">
            <div>
              <h2 className="section-label" style={{ color: 'var(--status-serious)' }}>
                Waiting for approval
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                Auto-fix is turned off. The agent found the cause but won&apos;t apply the fix until
                you approve.
              </p>
              {approveError && (
                <p className="mt-1 text-sm" style={{ color: 'var(--status-critical)' }}>
                  {approveError}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleApprove}
              disabled={approving}
              className="shrink-0 rounded-md bg-critical px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {approving ? 'Approving…' : 'Approve the fix'}
            </button>
          </div>
        </div>
      )}

      {incident.postmortem && (
        <div className="prose prose-invert prose-sm panel max-w-none p-4">
          <h2 className="not-prose section-label">Write-up</h2>
          <div className="mt-3">
            <ReactMarkdown>{incident.postmortem}</ReactMarkdown>
          </div>
        </div>
      )}
    </main>
  );
}
