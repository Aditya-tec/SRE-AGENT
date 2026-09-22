const express = require('express');
const { recordRequest } = require('./metricsState');
const healthRoute = require('./routes/health');
const metricsRoute = require('./routes/metrics');
const reserveRoute = require('./routes/reserve');

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
app.use(reserveRoute);

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`inventory-service listening on port ${PORT}`);
});
