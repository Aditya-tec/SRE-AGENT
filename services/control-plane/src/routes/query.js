const express = require('express');
const { z } = require('zod');
const { answerQuery, MAX_QUESTION_LENGTH } = require('../query');

const router = express.Router();

const querySchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
});

// Read-only natural-language status Q&A over incidents/services — see
// src/query.js for why this can't be talked into taking an action.
router.post('/query', async (req, res) => {
  const parsed = querySchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const result = await answerQuery(parsed.data.question);
    res.json(result);
  } catch (err) {
    console.error('[query] POST /query failed:', err.message);
    res.status(500).json({ error: 'failed to answer query' });
  }
});

module.exports = router;
