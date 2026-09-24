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

// A flat top-level path, not /incidents/confidence-report — Express
// would match that against the /incidents/:id route above first and
// treat "confidence-report" as an id.
const CONFIDENCE_LEVELS = ['high', 'medium', 'low'];
// Internal aggregate query, not the public ?limit= path — this report
// is only useful over the full incident history, not the last 200.
const CONFIDENCE_REPORT_SAMPLE_SIZE = 5000;

router.get('/confidence-report', async (req, res) => {
  try {
    const incidents = await db.listIncidents(CONFIDENCE_REPORT_SAMPLE_SIZE);
    const report = {};
    for (const level of CONFIDENCE_LEVELS) {
      const atLevel = incidents.filter((i) => i.confidence === level);
      const resolved = atLevel.filter((i) => i.resolved_at);
      const succeeded = resolved.filter((i) => i.remediation_success === true);
      report[level] = {
        total: atLevel.length,
        resolved: resolved.length,
        succeeded: succeeded.length,
        successRate: resolved.length > 0 ? succeeded.length / resolved.length : null,
      };
    }
    res.json(report);
  } catch (err) {
    console.error('[incidents] GET /confidence-report failed:', err.message);
    res.status(500).json({ error: 'failed to build confidence report' });
  }
});

module.exports = router;
