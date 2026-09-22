const express = require('express');
const { recordRequest } = require('./metricsState');
const healthRoute = require('./routes/health');
const metricsRoute = require('./routes/metrics');
const notifyRoute = require('./routes/notify');
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
app.use(notifyRoute);
app.use(chaosRoute);

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`notification-service listening on port ${PORT}`);
});
