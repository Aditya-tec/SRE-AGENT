#!/usr/bin/env node
// Thin client over control-plane's existing API — no new backend
// logic, just wraps GET /services, GET /incidents, POST /break-it.
const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || 'http://localhost:3000';
const VALID_FAULTS = ['latency', 'error_rate', 'crash'];

function usage() {
  console.log(`sre-cli — thin client for the control plane at ${CONTROL_PLANE_URL}

Usage:
  sre-cli status                        Show service health + recent incidents
  sre-cli break <service> <faultType>   Trigger a fault (faultType: ${VALID_FAULTS.join('|')})
  sre-cli scenario <name>               Trigger a named multi-step scenario

Env:
  CONTROL_PLANE_URL   defaults to http://localhost:3000`);
}

async function apiFetch(path, options) {
  const res = await fetch(`${CONTROL_PLANE_URL}${path}`, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${path} returned ${res.status}`);
  return body;
}

function pad(str, len) {
  return String(str).padEnd(len);
}

async function cmdStatus() {
  const services = await apiFetch('/services');
  console.log('SERVICE HEALTH');
  for (const s of services) {
    console.log(`  ${pad(s.name, 24)} ${pad(s.status, 10)} p95=${s.lastLatencyMs ?? '—'}ms  err=${s.lastErrorRate != null ? `${(s.lastErrorRate * 100).toFixed(0)}%` : '—'}`);
  }

  const incidents = await apiFetch('/incidents?limit=10');
  console.log('\nRECENT INCIDENTS');
  if (incidents.length === 0) {
    console.log('  none yet');
    return;
  }
  for (const i of incidents) {
    const status = i.resolved_at ? (i.remediation_success ? 'resolved' : 'unresolved') : 'in progress';
    console.log(`  ${pad(i.service_name, 24)} ${pad(i.fault_type, 12)} ${pad(status, 12)} detected=${i.detected_at}`);
  }
}

async function cmdBreak(service, faultType) {
  if (!service || !faultType) {
    console.error('usage: sre-cli break <service> <faultType>');
    process.exit(1);
  }
  const result = await apiFetch('/break-it', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, faultType }),
  });
  console.log('triggered:', JSON.stringify(result));
}

async function cmdScenario(name) {
  if (!name) {
    console.error('usage: sre-cli scenario <name>');
    process.exit(1);
  }
  const result = await apiFetch('/break-it', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario: name }),
  });
  console.log('triggered:', JSON.stringify(result));
}

async function main() {
  const [, , cmd, ...args] = process.argv;
  switch (cmd) {
    case 'status':
      return cmdStatus();
    case 'break':
      return cmdBreak(args[0], args[1]);
    case 'scenario':
      return cmdScenario(args[0]);
    default:
      usage();
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((err) => {
  console.error('sre-cli:', err.message);
  process.exit(1);
});
