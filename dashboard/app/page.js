'use client';

import { useEffect, useState, useCallback } from 'react';
import ServiceHealthGrid from '../components/ServiceHealthGrid';
import MetricsSummary from '../components/MetricsSummary';
import BreakItButton from '../components/BreakItButton';
import IncidentTimeline from '../components/IncidentTimeline';
import { getServices, getIncidents } from '../lib/api';

export default function DashboardPage() {
  const [services, setServices] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [error, setError] = useState(null);

  const refreshServices = useCallback(async () => {
    try {
      setServices(await getServices());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const refreshIncidents = useCallback(async () => {
    try {
      setIncidents(await getIncidents(20));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refreshServices();
    const timer = setInterval(refreshServices, 5000);
    return () => clearInterval(timer);
  }, [refreshServices]);

  useEffect(() => {
    refreshIncidents();
  }, [refreshIncidents]);

  useEffect(() => {
    const hasActive = incidents.some((i) => !i.resolved_at);
    const timer = setInterval(refreshIncidents, hasActive ? 3000 : 15000);
    return () => clearInterval(timer);
  }, [incidents, refreshIncidents]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Autonomous SRE Agent</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-secondary">
            Three microservices, a control plane that detects, diagnoses, and remediates incidents on its own —
            no human in the loop. Click &ldquo;Break It&rdquo; to watch it happen live.
          </p>
        </div>
        <BreakItButton onTriggered={refreshIncidents} />
      </header>

      {error && (
        <div className="mb-6 rounded-md border px-4 py-3 text-sm" style={{ borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }}>
          {error} — is the control plane reachable?
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-xs uppercase tracking-wide text-ink-muted">Service Health</h2>
        <ServiceHealthGrid services={services} />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xs uppercase tracking-wide text-ink-muted">Track Record</h2>
        <MetricsSummary incidents={incidents} />
      </section>

      <section>
        <h2 className="mb-3 text-xs uppercase tracking-wide text-ink-muted">Incident Timeline</h2>
        <IncidentTimeline incidents={incidents} />
      </section>
    </main>
  );
}
