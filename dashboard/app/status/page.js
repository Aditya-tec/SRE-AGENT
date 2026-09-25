'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getStatus } from '../../lib/api';

function toneFor(uptimePercent) {
  if (uptimePercent == null) return { color: 'var(--ink-muted)', label: 'No data yet' };
  if (uptimePercent >= 99) return { color: 'var(--status-good)', label: 'Operational' };
  if (uptimePercent >= 95) return { color: 'var(--status-warning)', label: 'Degraded' };
  return { color: 'var(--status-critical)', label: 'Outage' };
}

// Public, no-auth, deliberately minimal: uptime % only, nothing an
// admin dashboard would show (no incident internals, root causes, or
// postmortems). Separate route from "/" on purpose — this is what an
// outside visitor gets to see, not the operator's view.
export default function StatusPage() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getStatus());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:py-8">
      <div>
        <Link href="/" className="text-sm text-ink-muted transition hover:text-accent">
          ← Dashboard
        </Link>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">System status</h1>
        <p className="mt-1.5 text-sm text-ink-secondary">
          Uptime per service over the last 24 hours.
        </p>
      </div>

      {error && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }}
        >
          {error}
        </div>
      )}

      {!status && !error && <p className="text-sm text-ink-secondary">Loading…</p>}

      {status && (
        <div className="panel divide-y divide-border">
          {status.map((s) => {
            const tone = toneFor(s.uptimePercent);
            return (
              <div key={s.name} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: tone.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate font-mono text-sm text-ink-primary">{s.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-sm">
                  <span style={{ color: tone.color }}>{tone.label}</span>
                  <span className="w-16 text-right font-mono text-ink-secondary">
                    {s.uptimePercent != null ? `${s.uptimePercent.toFixed(2)}%` : '—'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
