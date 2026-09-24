const { createApp } = require('./app');
const poller = require('./poller');
const trafficGenerator = require('./trafficGenerator');
const logger = require('./logger');

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'unhandled rejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught exception');
});

const app = createApp();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'control-plane listening');
  poller.start();
  logger.info('polling loop started (5s interval)');
  trafficGenerator.start(PORT);
});
