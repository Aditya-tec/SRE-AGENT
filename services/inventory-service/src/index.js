const { createApp } = require('./app');

process.on('unhandledRejection', (err) => {
  console.error('[inventory-service] unhandled rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[inventory-service] uncaught exception:', err);
});

const app = createApp();
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`inventory-service listening on port ${PORT}`);
});
