'use client';

import { useEffect, useState } from 'react';
import { getAutonomy, setAutonomyPaused } from '../lib/api';

// Blocks every /break-it trigger, manual or autonomous. /break-it is
// public and unauthenticated by design, so there's no way to tell a
// legitimate manual test apart from an outside script hitting the API
// directly — this is a blunt emergency stop for that case (or for a
// known-bad state, e.g. exhausted Groq quota, piling up incidents
// unattended), not something to leave on during normal operation.
export default function AutonomyToggle() {
  const [paused, setPaused] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAutonomy()
      .then((res) => {
        if (!cancelled) setPaused(res.chaosPaused);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    if (paused === null || loading) return;
    setLoading(true);
    try {
      const res = await setAutonomyPaused(!paused);
      setPaused(res.chaosPaused);
    } catch {
      // leave the last-known state in place
    } finally {
      setLoading(false);
    }
  }

  if (paused === null) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      title={
        paused
          ? 'All chaos triggers (manual and scheduled) are paused'
          : 'Emergency stop — pause every Break It trigger, manual and scheduled'
      }
      className="hidden items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm text-ink-secondary transition hover:text-accent disabled:opacity-50 sm:inline-flex"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${paused ? 'bg-ink-muted' : 'bg-good'}`}
        aria-hidden="true"
      />
      {paused ? 'Chaos paused' : 'Chaos on'}
    </button>
  );
}
