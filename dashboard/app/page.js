'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import ServiceHealthGrid from '../components/ServiceHealthGrid';
import MetricsSummary from '../components/MetricsSummary';
import ConfidenceCalibration from '../components/ConfidenceCalibration';
import BreakItButton from '../components/BreakItButton';
import IncidentTimeline from '../components/IncidentTimeline';
import Section from '../components/Section';
import { getServices, getIncidents, getConfidenceReport } from '../lib/api';

const NAV = [
  { href: '#health', label: 'Health' },
  { href: '#metrics', label: 'Speed' },
  { href: '#confidence', label: 'Accuracy' },
  { href: '#incidents', label: 'Problems' },
];

export default function DashboardPage() {
  const [services, setServices] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [confidenceReport, setConfidenceReport] = useState(null);
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
    // Best-effort — the confidence report is a secondary panel, not
    // worth surfacing its own error banner or blocking the main view.
    try {
      setConfidenceReport(await getConfidenceReport());
    } catch {
      // leave the last-known report in place
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

  const activeCount = incidents.filter((i) => !i.resolved_at).length;
  const healthyCount = services.filter((s) => s.status === 'healthy').length;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-page/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Autonomous SRE Agent</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-good" aria-hidden="true" />
                {activeCount > 0
                  ? `${activeCount} problem${activeCount === 1 ? '' : 's'} open`
                  : services.length > 0
                    ? `${healthyCount} of ${services.length} services OK`
                    : 'Connecting…'}
              </p>
            </div>
            <nav className="hidden items-center gap-1 md:flex" aria-label="Sections">
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-2.5 py-1.5 text-sm text-ink-muted transition hover:bg-white/[0.04] hover:text-ink-primary"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/status"
              className="hidden rounded-md px-2.5 py-1.5 text-sm text-ink-secondary transition hover:text-accent sm:inline"
            >
              Status page
            </Link>
            <BreakItButton onTriggered={refreshIncidents} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:py-8">
        <div className="animate-in max-w-2xl" style={{ '--delay': '0ms' }}>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Watches three services. Finds root causes. Fixes them.
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
            Press <span className="font-medium text-ink-primary">Break It</span> to inject a fault on
            purpose, then watch detection, diagnosis, and remediation happen below.
          </p>
        </div>

        {error && (
          <div
            className="animate-in rounded-lg border px-4 py-3 text-sm"
            style={{
              '--delay': '40ms',
              borderColor: 'var(--status-critical)',
              color: 'var(--status-critical)',
              backgroundColor: 'rgba(239,68,68,0.08)',
            }}
          >
            Can&apos;t reach the backend: {error}
          </div>
        )}

        <Section
          id="health"
          title="Service health"
          description="Are the services up? How fast are they responding?"
          meta={services.length ? `${healthyCount} healthy` : null}
          delay={60}
        >
          <ServiceHealthGrid services={services} />
        </Section>

        <Section
          id="metrics"
          title="How fast it works"
          description="Average time to find the cause and fix the problem."
          delay={100}
        >
          <MetricsSummary incidents={incidents} />
        </Section>

        <Section
          id="confidence"
          title="How often fixes work"
          description="When the agent felt sure, how often did the fix actually succeed?"
          delay={140}
        >
          <ConfidenceCalibration report={confidenceReport} />
        </Section>

        <Section
          id="incidents"
          title="Problems"
          description="Recent issues. Click any row to see what happened and how it was fixed."
          meta={incidents.length ? `${incidents.length} recent` : null}
          delay={180}
        >
          <IncidentTimeline incidents={incidents} />
        </Section>
      </main>
    </>
  );
}
