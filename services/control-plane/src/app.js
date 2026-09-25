const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const poller = require('./poller');
const logger = require('./logger');
const incidentsRoute = require('./routes/incidents');
const servicesRoute = require('./routes/services');
const gatewayRoute = require('./routes/gateway');
const breakItRoute = require('./routes/breakIt');
const statusRoute = require('./routes/status');
const queryRoute = require('./routes/query');
const metricsRoute = require('./routes/metrics');

function corsOptions() {
  const origins = process.env.DASHBOARD_ORIGIN
    ? process.env.DASHBOARD_ORIGIN.split(',').map((s) => s.trim())
    : null;
  // Unset in local dev / before the dashboard has a fixed URL: stays
  // open. Set it once the dashboard is deployed to lock this down.
  return origins ? { origin: origins } : {};
}

function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '10kb' }));

  // A generous baseline across the whole API, then a much tighter
  // per-IP limit on /break-it specifically — it's the one endpoint
  // whose whole job is to make something worse on purpose, and it's
  // public and unauthenticated by design, so it's worth capping hard.
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  // Configurable so the local-dev seed script can fire many scenarios
  // back to back (the chaos-in-progress lock already serializes them —
  // this limit exists to stop a public, untrusted visitor from
  // spamming the deployed demo, which doesn't apply to a single local
  // operator). Unset, behavior is identical to before this existed.
  const breakItWindowMs = Number(process.env.BREAK_IT_RATE_LIMIT_WINDOW_MS) || 5 * 60 * 1000;
  const breakItMax = Number(process.env.BREAK_IT_RATE_LIMIT_MAX) || 1;
  const breakItLimiter = rateLimit({
    windowMs: breakItWindowMs,
    limit: breakItMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: `you can trigger up to ${breakItMax} incident${breakItMax === 1 ? '' : 's'} every ${breakItWindowMs / 60000} minutes — try again shortly`,
    },
  });

  // /query is another public, unauthenticated Groq call — same abuse
  // shape as /break-it (someone hammering it to burn API quota), but
  // it's read-only and cheap per-call, so it gets a looser per-IP cap
  // rather than break-it's one-per-5-minutes.
  const queryLimiter = rateLimit({
    windowMs: Number(process.env.QUERY_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
    limit: Number(process.env.QUERY_RATE_LIMIT_MAX) || 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too many questions — try again in a minute' },
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'control-plane',
      uptimeSec: Math.floor(process.uptime()),
      lastPollAt: poller.getLastPollAt(),
    });
  });

  app.use(incidentsRoute);
  app.use(servicesRoute);
  app.use(statusRoute);
  app.use(gatewayRoute);
  app.use('/break-it', breakItLimiter);
  app.use(breakItRoute);
  app.use('/query', queryLimiter);
  app.use(queryRoute);
  app.use(metricsRoute);

  app.use((err, req, res, next) => {
    logger.error({ err }, 'unhandled error');
    res.status(err.status || 500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = { createApp };
