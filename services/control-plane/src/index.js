const { createApp } = require('./app');
const poller = require('./poller');
const trafficGenerator = require('./trafficGenerator');

process.on('unhandledRejection', (err) => {
  console.error('[control-plane] unhandled rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[control-plane] uncaught exception:', err);
});

const app = createApp();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`control-plane listening on port ${PORT}`);
  poller.start();
  console.log('[control-plane] polling loop started (5s interval)');
  trafficGenerator.start(PORT);
});
