const express = require('express');
const { recordRequest } = require('./metricsState');
const healthRoute = require('./routes/health');
const metricsRoute = require('./routes/metrics');
const ordersRoute = require('./routes/orders');
const chaosRoute = require('./routes/chaos');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    recordRequest(Date.now() - start, res.statusCode >= 500);
  });
  next();
});

app.use(healthRoute);
app.use(metricsRoute);
app.use(ordersRoute);
app.use(chaosRoute);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`order-service (replica ${process.env.REPLICA_ID || 'a'}) listening on port ${PORT}`);
});
