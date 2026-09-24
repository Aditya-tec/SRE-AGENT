const express = require('express');
const db = require('../db');
const poller = require('../poller');

const router = express.Router();

// metrics_snapshots is already pruned to a rolling 24h window by
// poller.js's deleteOldSnapshots() on every poll cycle, so "all
// snapshots for this service" IS "snapshots from the last 24h" —
// no extra time filter needed. A large limit stands in for "all".
const SNAPSHOT_SAMPLE_SIZE = 100000;

// Public, no-auth, deliberately thin: uptime % only — no incident
// internals, no root causes, no postmortems. That's the admin
// dashboard's job; this is what an outside visitor gets to see.
router.get('/status', async (req, res) => {
  try {
    const services = Object.keys(poller.SERVICES);
    const status = await Promise.all(
      services.map(async (name) => {
        const snapshots = await db.getRecentSnapshots(name, SNAPSHOT_SAMPLE_SIZE);
        const up = snapshots.filter((s) => s.status && s.status !== 'down').length;
        const uptimePercent = snapshots.length > 0 ? (up / snapshots.length) * 100 : null;
        return { name, uptimePercent };
      })
    );
    res.json(status);
  } catch (err) {
    console.error('[status] GET /status failed:', err.message);
    res.status(500).json({ error: 'failed to build status report' });
  }
});

module.exports = router;
