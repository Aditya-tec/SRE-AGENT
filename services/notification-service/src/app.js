const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { recordRequest } = require('./metricsState');
const healthRoute = require('./routes/health');
const metricsRoute = require('./routes/metrics');
const notifyRoute = require('./routes/notify');
const chaosRoute = require('./routes/chaos');

function createApp() {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 60,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      recordRequest(Date.now() - start, res.statusCode >= 500);
    });
    next();
  });

  app.use(healthRoute);
  app.use(metricsRoute);
  app.use(notifyRoute);
  app.use(chaosRoute);

  app.use((err, req, res, next) => {
    console.error('[notification-service] unhandled error:', err.message);
    res.status(err.status || 500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = { createApp };
