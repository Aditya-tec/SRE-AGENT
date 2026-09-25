'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import StatusBadge from './StatusBadge';
import { getIncidentPhase, PHASE_LABELS, PHASE_TONE } from '../lib/incidentPhase';
import { formatTimestamp } from '../lib/format';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Open' },
  { id: 'resolved', label: 'Closed' },
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

function labelMap(map, value) {
  if (!value) return '—';
  return map[value] || value.replace(/_/g, ' ');
}

export default function IncidentTimeline({ incidents }) {
  const router = useRouter();
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    if (filter === 'active') return incidents.filter((i) => !i.resolved_at);
    if (filter === 'resolved') return incidents.filter((i) => i.resolved_at);
    return incidents;
  }, [incidents, filter]);

  const counts = useMemo(
    () => ({
      all: incidents.length,
      active: incidents.filter((i) => !i.resolved_at).length,
      resolved: incidents.filter((i) => i.resolved_at).length,
    }),
    [incidents],
  );

  if (incidents.length === 0) {
    return (
      <div className="panel px-5 py-10 text-center">
        <p className="text-base text-ink-secondary">No problems yet.</p>
        <p className="mt-1 text-sm text-ink-muted">
          Press <span className="text-ink-secondary">Break It</span> above, then come back here.
        </p>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2.5">
        <div className="flex gap-1 rounded-md bg-black/40 p-1" role="tablist" aria-label="Filter problems">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'bg-surface-raised text-ink-primary'
                    : 'text-ink-muted hover:text-ink-secondary'
                }`}
              >
                {f.label}
                <span className="ml-1.5 tabular-nums text-ink-muted">{counts[f.id]}</span>
              </button>
            );
          })}
        </div>
        <p className="text-sm text-ink-muted">Click a row for details</p>
      </div>

      {filtered.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-ink-muted">
          Nothing in this filter.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-ink-muted">
                <th className="px-3 py-2 font-medium">Service</th>
                <th className="px-3 py-2 font-medium">What broke</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">How it started</th>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((incident) => {
                const phase = getIncidentPhase(incident);
                return (
                  <tr
                    key={incident.id}
                    tabIndex={0}
                    role="link"
                    onClick={() => router.push(`/incidents/${incident.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/incidents/${incident.id}`);
                      }
                    }}
                    className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-none"
                  >
                    <td className="px-3 py-2.5 font-mono text-ink-primary">{incident.service_name}</td>
                    <td className="px-3 py-2.5 text-ink-secondary">
                      {labelMap(FAULT_LABELS, incident.fault_type)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge tone={PHASE_TONE[phase]} label={PHASE_LABELS[phase]} />
                        {incident.is_flapping && <StatusBadge tone="warning" label="Unstable" />}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-ink-secondary">
                      {labelMap(TRIGGER_LABELS, incident.trigger_type)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-ink-muted">
                      {formatTimestamp(incident.detected_at)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm text-accent">Open →</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
