'use client';

import { useEffect, useState } from 'react';
import { getAutonomy, setAutonomyPaused } from '../lib/api';

const SECRET_STORAGE_KEY = 'sre-admin-secret';
// Sliding window, not a fixed one — every successful use refreshes it,
// so an operator actively using the toggle never gets re-prompted, but
// it goes stale 5 minutes after the last real use rather than being
// cached in the browser forever.
const SECRET_TTL_MS = 5 * 60 * 1000;

function getStoredSecret() {
  try {
    const raw = localStorage.getItem(SECRET_STORAGE_KEY);
    if (!raw) return '';
    const { secret, expiresAt } = JSON.parse(raw);
    if (!secret || !expiresAt || Date.now() > expiresAt) {
      localStorage.removeItem(SECRET_STORAGE_KEY);
      return '';
    }
    return secret;
  } catch {
    return '';
  }
}

function storeSecret(secret) {
  try {
    localStorage.setItem(SECRET_STORAGE_KEY, JSON.stringify({ secret, expiresAt: Date.now() + SECRET_TTL_MS }));
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
// code (anyone could read it from the page), so it's requested via a
// prompt and cached in this browser for 5 minutes at a time, refreshed
// on every use, rather than remembered indefinitely.
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
        // No secret cached (never entered, or its 5-minute window
        // lapsed), or the cached one is wrong.
        clearStoredSecret();
        secret = window.prompt('Admin secret required to pause/resume chaos:') || '';
        if (!secret) return;
        res = await setAutonomyPaused(!paused, secret);
      }
      // Refresh the 5-minute window on every successful use (including
      // ones that used an already-cached secret), so an operator making
      // several changes in a row isn't reprompted mid-session.
      storeSecret(secret);
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
