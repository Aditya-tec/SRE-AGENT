const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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

  // A generous baseline across the whole API, then a tighter limit on
  // /break-it specifically — it's the one endpoint whose whole job is
  // to make something worse on purpose, so it's the one worth capping
  // hardest against being hammered.
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  const breakItLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too many break-it requests, slow down' },
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'control-plane', uptimeSec: Math.floor(process.uptime()) });
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
