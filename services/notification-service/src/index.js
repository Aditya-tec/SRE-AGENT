const { createApp } = require('./app');

process.on('unhandledRejection', (err) => {
  console.error('[notification-service] unhandled rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[notification-service] uncaught exception:', err);
});

const app = createApp();
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`notification-service listening on port ${PORT}`);
});
