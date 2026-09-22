const express = require('express');

const router = express.Router();

router.post('/notify', (req, res) => {
  const { orderId, message } = req.body || {};

  if (typeof orderId !== 'string' || typeof message !== 'string') {
    return res.status(400).json({ error: 'orderId (string) and message (string) are required' });
  }

  console.log(`[notify] order=${orderId} message="${message}"`);
  res.json({ sent: true, channel: 'email' });
});

module.exports = router;
