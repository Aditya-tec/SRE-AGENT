'use client';

import { useState } from 'react';
import { breakIt } from '../lib/api';

// A curated, safe subset — not free-form — per the plan's dashboard spec.
const OPTIONS = [
  { label: 'Crash order-service', service: 'order-service-a', faultType: 'crash' },
  { label: 'Slow down inventory-service', service: 'inventory-service', faultType: 'latency' },
  { label: 'Error-storm notification-service', service: 'notification-service', faultType: 'error_rate' },
];

export default function BreakItButton({ onTriggered }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  async function trigger(option) {
    setOpen(false);
    setLoading(true);
    try {
      await breakIt(option.service, option.faultType);
      setStatus({ type: 'success', text: 'Incident triggered — watch the timeline below.' });
      onTriggered?.();
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(null), 5000);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="rounded-md bg-critical px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {loading ? 'Triggering…' : 'Break It'}
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-64 rounded-md border border-border bg-surface p-1 shadow-lg">
          {OPTIONS.map((option) => (
            <button
              key={option.label}
              onClick={() => trigger(option)}
              className="block w-full rounded px-3 py-2 text-left text-sm text-ink-primary hover:bg-white/5"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {status && (
        <div
          className="absolute right-0 top-full z-10 mt-2 w-64 rounded-md border border-border px-3 py-2 text-xs"
          style={{
            backgroundColor: 'var(--surface)',
            color: status.type === 'success' ? 'var(--status-good)' : 'var(--status-critical)',
          }}
        >
          {status.text}
        </div>
      )}
    </div>
  );
}
