const express = require('express');
const { maybeApplyChaos } = require('../chaosState');

const router = express.Router();

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

  const { item, quantity } = req.body || {};

  if (typeof item !== 'string' || !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'item (string) and quantity (positive integer) are required' });
  }

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
