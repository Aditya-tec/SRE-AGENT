const pino = require('pino');

// JSON lines by default (what a log aggregator wants); pipe through
// `pino-pretty` locally (`npm run dev | npx pino-pretty`) for a
// human-readable stream instead of adding transport branching here.
module.exports = pino({ level: process.env.LOG_LEVEL || 'info' });
