'use client';

import { useEffect, useState } from 'react';
import { getAutonomy, setAutonomyPaused } from '../lib/api';

const SECRET_STORAGE_KEY = 'sre-admin-secret';

function getStoredSecret() {
  try {
    return localStorage.getItem(SECRET_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function storeSecret(secret) {
  try {
    localStorage.setItem(SECRET_STORAGE_KEY, secret);
  } catch {
    // private browsing / storage disabled — the prompt will just
    // reappear next click, which is a minor inconvenience, not a bug
  }
}

function clearStoredSecret() {
  try {
    localStorage.removeItem(SECRET_STORAGE_KEY);
  } catch {
    // see above
  }
}

// Blocks every /break-it trigger, manual or autonomous. /break-it is
// public and unauthenticated by design, so there's no way to tell a
// legitimate manual test apart from an outside script hitting the API
// directly — this is a blunt emergency stop for that case (or for a
// known-bad state, e.g. exhausted Groq quota, piling up incidents
// unattended), not something to leave on during normal operation.
//
// POST /autonomy requires an admin secret once the operator has
// configured one (ADMIN_SECRET on control-plane) — otherwise anyone
// hammering the public API could just un-pause this the moment it's
// used against them. The secret can't be baked into this client-side
// code (anyone could read it from the page), so it's requested once
// via a prompt and kept only in this browser's local storage.
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
      let secret = getStoredSecret();
      let res;
      try {
        res = await setAutonomyPaused(!paused, secret);
      } catch (err) {
        if (err.message !== 'unauthorized') throw err;
        // No secret stored yet, or the stored one is stale/wrong.
        clearStoredSecret();
        secret = window.prompt('Admin secret required to pause/resume chaos:') || '';
        if (!secret) return;
        res = await setAutonomyPaused(!paused, secret);
        storeSecret(secret);
      }
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
