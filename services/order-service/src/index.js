const { createApp } = require('./app');
const logger = require('./logger');

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'unhandled rejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught exception');
});

const app = createApp();
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info({ port: PORT, replicaId: process.env.REPLICA_ID || 'a' }, 'order-service listening');
});

// Diagnostic: notification-service and inventory-service have been
// crashing intermittently on Render's free tier with no application-
// level error ever logged beforehand — consistent with an OOM kill,
// unconfirmed since free tier hides memory metrics. order-service-a
// showed a real 50% error rate during that same window, so this is
// added here too. If it's a real leak, RSS will climb steadily right
// up to the last line before a crash; if it plateaus normally, that
// points at genuine resource pressure under real sustained traffic on
// a tiny instance instead of a code bug.
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
