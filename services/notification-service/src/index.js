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
