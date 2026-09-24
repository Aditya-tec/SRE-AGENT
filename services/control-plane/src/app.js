const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const poller = require('./poller');
const incidentsRoute = require('./routes/incidents');
const servicesRoute = require('./routes/services');
const gatewayRoute = require('./routes/gateway');
const breakItRoute = require('./routes/breakIt');

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
  const breakItLimiter = rateLimit({
    windowMs: Number(process.env.BREAK_IT_RATE_LIMIT_WINDOW_MS) || 5 * 60 * 1000,
    limit: Number(process.env.BREAK_IT_RATE_LIMIT_MAX) || 1,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'you can trigger one incident every 5 minutes — try again shortly' },
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
  app.use(gatewayRoute);
  app.use('/break-it', breakItLimiter);
  app.use(breakItRoute);

  app.use((err, req, res, next) => {
    console.error('[control-plane] unhandled error:', err.message);
    res.status(err.status || 500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = { createApp };
