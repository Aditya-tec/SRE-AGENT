'use client';

import { useEffect, useState } from 'react';
import { getAutonomy, setAutonomyPaused } from '../lib/api';

// Pauses only the scheduled/autonomous chaos trigger — manual "Break
// It" clicks always still work. Exists so a known-bad state (e.g. Groq
// quota exhausted) doesn't keep piling up unresolved incidents every
// ~2h while someone fixes the underlying cause.
export default function AutonomyToggle() {
  const [paused, setPaused] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAutonomy()
      .then((res) => {
        if (!cancelled) setPaused(res.autonomousChaosPaused);
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
      setPaused(res.autonomousChaosPaused);
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
          ? 'Scheduled chaos is paused — manual Break It still works'
          : 'Pause the scheduled autonomous chaos trigger'
      }
      className="hidden items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm text-ink-secondary transition hover:text-accent disabled:opacity-50 sm:inline-flex"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${paused ? 'bg-ink-muted' : 'bg-good'}`}
        aria-hidden="true"
      />
      {paused ? 'Autonomous chaos paused' : 'Autonomous chaos on'}
    </button>
  );
}
