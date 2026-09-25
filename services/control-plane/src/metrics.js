const db = require('./db');

// Matches the confidence-report's aggregate sample size (src/routes/incidents.js) —
// this is a full-history aggregate, not the public ?limit= path.
const INCIDENT_SAMPLE_SIZE = 5000;

function escapeLabelValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function formatMetric(name, help, type, samples) {
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`];
  for (const { labels, value } of samples) {
    const labelStr =
      labels && Object.keys(labels).length
        ? '{' + Object.entries(labels).map(([k, v]) => `${k}="${escapeLabelValue(v)}"`).join(',') + '}'
        : '';
    lines.push(`${name}${labelStr} ${value}`);
  }
  return lines.join('\n');
}

async function buildMetricsText() {
  const [services, incidents] = await Promise.all([
    db.listServices(),
    db.listIncidents(INCIDENT_SAMPLE_SIZE),
  ]);

  const blocks = [];

  blocks.push(
    formatMetric(
      'sre_service_up',
      'Whether the service was healthy as of its last poll (1) or not (0).',
      'gauge',
      services.map((s) => ({ labels: { service: s.name }, value: s.status === 'healthy' ? 1 : 0 }))
    )
  );

  blocks.push(
    formatMetric(
      'sre_service_last_latency_ms',
      'Latency in ms observed on the most recent poll.',
      'gauge',
      services
        .filter((s) => s.last_latency_ms != null)
        .map((s) => ({ labels: { service: s.name }, value: s.last_latency_ms }))
    )
  );

  blocks.push(
    formatMetric(
      'sre_service_last_error_rate',
      'Error rate observed on the most recent poll, 0-1.',
      'gauge',
      services
        .filter((s) => s.last_error_rate != null)
        .map((s) => ({ labels: { service: s.name }, value: s.last_error_rate }))
    )
  );

  const openIncidents = incidents.filter((i) => !i.resolved_at);
  blocks.push(
    formatMetric(
      'sre_incidents_open',
      'Number of currently unresolved incidents.',
      'gauge',
      [{ labels: {}, value: openIncidents.length }]
    )
  );

  const byConfidence = {};
  for (const i of incidents) {
    const level = i.confidence || 'unknown';
    byConfidence[level] = (byConfidence[level] || 0) + 1;
  }
  blocks.push(
    formatMetric(
      'sre_incidents_total',
      'Count of incidents in the sampled history, by diagnosis confidence.',
      'counter',
      Object.entries(byConfidence).map(([level, count]) => ({ labels: { confidence: level }, value: count }))
    )
  );

  // resolved_at is stamped when an incident stops being tracked, not
  // only on a genuine recovery — one that exhausted all remediation
  // attempts closes as remediation_success: false with the same
  // timestamp. Restrict to true successes so this is an honest MTTR,
  // not "time until the agent gave up" blended in with real fixes.
  const resolved = incidents.filter((i) => i.resolved_at && i.detected_at && i.remediation_success === true);
  if (resolved.length > 0) {
    const totalSeconds = resolved.reduce(
      (sum, i) => sum + (new Date(i.resolved_at).getTime() - new Date(i.detected_at).getTime()) / 1000,
      0
    );
    blocks.push(
      formatMetric(
        'sre_incident_mttr_seconds',
        'Average time from detection to resolution across sampled resolved incidents.',
        'gauge',
        [{ labels: {}, value: (totalSeconds / resolved.length).toFixed(2) }]
      )
    );
  }

  const flappingCount = incidents.filter((i) => i.is_flapping).length;
  blocks.push(
    formatMetric(
      'sre_incidents_flapping_total',
      'Count of sampled incidents flagged as flapping.',
      'counter',
      [{ labels: {}, value: flappingCount }]
    )
  );

  return blocks.join('\n\n') + '\n';
}

module.exports = { buildMetricsText };
