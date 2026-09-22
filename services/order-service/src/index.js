const { createApp } = require('./app');

process.on('unhandledRejection', (err) => {
  console.error('[order-service] unhandled rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[order-service] uncaught exception:', err);
});

const app = createApp();
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`order-service (replica ${process.env.REPLICA_ID || 'a'}) listening on port ${PORT}`);
});
