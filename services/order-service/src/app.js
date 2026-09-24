const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { recordRequest } = require('./metricsState');
const healthRoute = require('./routes/health');
const metricsRoute = require('./routes/metrics');
const ordersRoute = require('./routes/orders');
const chaosRoute = require('./routes/chaos');
const logger = require('./logger');

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
  app.use(ordersRoute);
  app.use(chaosRoute);

  // Malformed JSON bodies, etc. should return a JSON error, not
  // Express's default HTML error page.
  app.use((err, req, res, next) => {
    logger.error({ err }, 'unhandled error');
    res.status(err.status || 500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = { createApp };
