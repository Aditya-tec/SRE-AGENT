const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/incidents', async (req, res) => {
  const limit = Number.parseInt(req.query.limit, 10) || 20;
  try {
    const incidents = await db.listIncidents(limit);
    res.json(incidents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/incidents/:id', async (req, res) => {
  try {
    const incident = await db.getIncident(req.params.id);
    if (!incident) return res.status(404).json({ error: 'incident not found' });
    res.json(incident);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
