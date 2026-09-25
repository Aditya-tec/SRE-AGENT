'use client';

import { useEffect, useRef, useState } from 'react';
import { breakIt, breakItScenario } from '../lib/api';

// A curated, safe subset — not free-form — per the plan's dashboard spec.
const OPTIONS = [
  {
    label: 'Crash the order service',
    service: 'order-service-a',
    faultType: 'crash',
    kind: 'One service',
    description: 'Take order-service down completely',
  },
  {
    label: 'Slow down inventory',
    service: 'inventory-service',
    faultType: 'latency',
    kind: 'One service',
    description: 'Make inventory replies take much longer',
  },
  {
    label: 'Make notifications fail',
    service: 'notification-service',
    faultType: 'error_rate',
    kind: 'One service',
    description: 'Return errors from the notification service',
  },
  {
    label: 'Chain reaction',
    scenario: 'cascading-failure',
    description: 'Slow inventory, then crash notifications',
    kind: 'Multi-step',
  },
  {
    label: 'Pressure both order copies',
    scenario: 'dual-replica-pressure',
    description: 'Slow one order service, error the other',
    kind: 'Multi-step',
  },
  {
    label: 'Inventory then orders',
    scenario: 'inventory-then-orders',
    description: 'Break inventory first, then slow orders',
    kind: 'Multi-step',
  },
];

export default function BreakItButton({ onTriggered }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function trigger(option) {
    setOpen(false);
    setLoading(true);
    try {
      const result = option.scenario
        ? await breakItScenario(option.scenario)
        : await breakIt(option.service, option.faultType);

      // Chaos can be globally paused (see the header toggle) — the API
      // still returns 200 for this (so a scheduled job's health check
      // doesn't read it as a failure), so a real skip has to be told
      // apart from a real trigger by the response body, not the status.
      if (result?.skipped) {
        setStatus({ type: 'error', text: 'Nothing happened — chaos is currently paused (see the header toggle).' });
      } else {
        setStatus({ type: 'success', text: 'Broken on purpose — watch Health and Problems below.' });
        onTriggered?.();
      }
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(null), 5000);
    }
  }

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded-md bg-critical px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-critical disabled:opacity-50"
      >
        {loading ? 'Breaking…' : 'Break It'}
      </button>

      {open && (
        <div
          role="menu"
          className="break-it-menu absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-surface shadow-lg shadow-black/60"
        >
          <div className="border-b border-border px-4 py-2.5">
            <p className="section-label">Inject a fault</p>
            <p className="mt-1 text-sm text-ink-muted">
              The agent should notice, find the cause, and fix it.
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto p-1.5">
            {OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                role="menuitem"
                onClick={() => trigger(option)}
                className="block w-full rounded-md px-3 py-2 text-left transition hover:bg-white/[0.05] focus-visible:bg-white/[0.05] focus-visible:outline-none"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink-primary">{option.label}</span>
                  <span className="shrink-0 text-xs text-ink-muted">{option.kind}</span>
                </span>
                {option.description && (
                  <span className="mt-1 block text-sm text-ink-muted">{option.description}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {status && (
        <div
          className="break-it-menu absolute right-0 top-full z-30 mt-2 w-72 rounded-md border border-border bg-surface px-3 py-2.5 text-sm leading-relaxed"
          style={{
            color: status.type === 'success' ? 'var(--status-good)' : 'var(--status-critical)',
          }}
          role="status"
        >
          {status.text}
        </div>
      )}
    </div>
  );
}
