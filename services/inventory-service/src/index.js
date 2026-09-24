const { createApp } = require('./app');
const logger = require('./logger');

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'unhandled rejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught exception');
});

const app = createApp();
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'inventory-service listening');
});
