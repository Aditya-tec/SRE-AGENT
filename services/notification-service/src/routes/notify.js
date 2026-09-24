const express = require('express');
const { z } = require('zod');
const { maybeApplyChaos } = require('../chaosState');

const router = express.Router();

const notifyBodySchema = z.object({
  orderId: z.string().min(1),
  message: z.string().min(1),
});

router.post('/notify', async (req, res) => {
  const chaosResult = await maybeApplyChaos();
  if (chaosResult) {
    return res.status(chaosResult.status).json(chaosResult.body);
  }

  const parsed = notifyBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'orderId (string) and message (string) are required' });
  }
  const { orderId, message } = parsed.data;

  console.log(`[notify] order=${orderId} message="${message}"`);
  res.json({ sent: true, channel: 'email' });
});

module.exports = router;
