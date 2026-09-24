const express = require('express');
const db = require('../db');
const poller = require('../poller');

const router = express.Router();

// Caps how many rows a caller can pull in one request — unbounded, a
// public ?limit=999999999 could force a full table scan/transfer on
// every poll cycle's worth of history.
const MAX_LIMIT = 200;

router.get('/incidents', async (req, res) => {
  const parsed = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_LIMIT) : 20;
  try {
    const incidents = await db.listIncidents(limit);
    res.json(incidents);
  } catch (err) {
    console.error('[incidents] GET /incidents failed:', err.message);
    res.status(500).json({ error: 'failed to list incidents' });
  }
});

router.get('/incidents/:id', async (req, res) => {
  try {
    const incident = await db.getIncident(req.params.id);
    if (!incident) return res.status(404).json({ error: 'incident not found' });
    res.json(incident);
  } catch (err) {
    console.error(`[incidents] GET /incidents/${req.params.id} failed:`, err.message);
    res.status(500).json({ error: 'failed to fetch incident' });
  }
});

// Only meaningful when AUTO_REMEDIATE=false paused this incident at
// "awaiting approval" instead of auto-executing the diagnosed action.
router.post('/incidents/:id/approve', async (req, res) => {
  const result = await poller.approveIncident(req.params.id);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ approved: true });
});

module.exports = router;
