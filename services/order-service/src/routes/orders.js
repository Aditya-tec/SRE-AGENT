const express = require('express');
const crypto = require('crypto');
const { maybeApplyChaos } = require('../chaosState');

const router = express.Router();
const orders = new Map();

const INVENTORY_URL = process.env.INVENTORY_URL || 'http://localhost:3002';
const NOTIFICATION_URL = process.env.NOTIFICATION_URL || 'http://localhost:3003';
const UPSTREAM_TIMEOUT_MS = 5000;

async function callUpstream(url, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

router.post('/orders', async (req, res) => {
  const chaosResult = await maybeApplyChaos();
  if (chaosResult) {
    return res.status(chaosResult.status).json(chaosResult.body);
  }

  const { item, quantity } = req.body || {};

  if (typeof item !== 'string' || !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'item (string) and quantity (positive integer) are required' });
  }

  let reserveResult;
  try {
    reserveResult = await callUpstream(`${INVENTORY_URL}/reserve`, { item, quantity });
  } catch (err) {
    return res.status(502).json({ error: 'inventory-service unreachable' });
  }

  if (!reserveResult.ok) {
    return res.status(reserveResult.status).json(reserveResult.data);
  }

  const orderId = `ord_${crypto.randomBytes(4).toString('hex')}`;
  const order = { orderId, status: 'confirmed', item, quantity };
  orders.set(orderId, order);

  try {
    await callUpstream(`${NOTIFICATION_URL}/notify`, {
      orderId,
      message: 'Your order is confirmed',
    });
  } catch (err) {
    console.error(`[order-service] notification failed for ${orderId}:`, err.message);
  }

  res.status(201).json(order);
});

router.get('/orders/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'order not found' });
  }
  res.json(order);
});

module.exports = router;
