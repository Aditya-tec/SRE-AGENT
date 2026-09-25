const { createApp } = require('./app');
const logger = require('./logger');

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'unhandled rejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught exception');
});

const app = createApp();
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'notification-service listening');
});

// This service has been crashing intermittently on Render's free tier
// with no application-level error ever logged (consistent with an
// OOM kill, which gives the process no chance to log anything before
// it's gone). This is diagnostic only — if it's genuinely a memory
// leak, the RSS trend across these lines will climb steadily right up
// to the last one before a crash, instead of plateauing like normal
// GC behavior. Cheap enough to leave running permanently.
const memoryLogTimer = setInterval(() => {
  const mem = process.memoryUsage();
  logger.info(
    {
      rssMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      externalMB: Math.round(mem.external / 1024 / 1024),
    },
    'memory usage'
  );
}, 30000);
memoryLogTimer.unref();
