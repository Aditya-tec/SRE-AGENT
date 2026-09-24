const express = require('express');
const { z } = require('zod');
const { maybeApplyChaos } = require('../chaosState');

const router = express.Router();

const reserveBodySchema = z.object({
  item: z.string().min(1),
  quantity: z.number().int().positive(),
});

const stock = {
  'blue-mug': 50,
  'red-mug': 50,
  't-shirt-m': 40,
  't-shirt-l': 40,
  'sticker-pack': 100,
  'notebook': 30,
  'water-bottle': 25,
  'tote-bag': 20,
  'hoodie': 15,
  'cap': 35,
};

router.post('/reserve', async (req, res) => {
  const chaosResult = await maybeApplyChaos();
  if (chaosResult) {
    return res.status(chaosResult.status).json(chaosResult.body);
  }

  const parsed = reserveBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'item (string) and quantity (positive integer) are required' });
  }
  const { item, quantity } = parsed.data;

  // hasOwnProperty, not the `in` operator: `in` also matches inherited
  // Object.prototype keys, so item: "constructor" or "toString" would
  // otherwise slip past this check and let stock[item] read/write a
  // prototype property instead of a real stock entry.
  if (!Object.prototype.hasOwnProperty.call(stock, item)) {
    return res.status(404).json({ error: `unknown item: ${item}` });
  }

  if (stock[item] < quantity) {
    return res.status(409).json({ error: 'insufficient stock', remaining: stock[item] });
  }

  stock[item] -= quantity;
  res.json({ reserved: true, remaining: stock[item] });
});

module.exports = router;
