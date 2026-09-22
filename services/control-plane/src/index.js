const express = require('express');
const cors = require('cors');
const poller = require('./poller');
const trafficGenerator = require('./trafficGenerator');
const incidentsRoute = require('./routes/incidents');
const servicesRoute = require('./routes/services');
const gatewayRoute = require('./routes/gateway');
const breakItRoute = require('./routes/breakIt');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'control-plane', uptimeSec: Math.floor(process.uptime()) });
});

app.use(incidentsRoute);
app.use(servicesRoute);
app.use(gatewayRoute);
app.use(breakItRoute);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`control-plane listening on port ${PORT}`);
  poller.start();
  console.log('[control-plane] polling loop started (5s interval)');
  trafficGenerator.start(PORT);
});
