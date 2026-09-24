const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

// Type translation from supabase/schema.sql, since SQLite has no native
// uuid/jsonb/timestamptz types: uuid -> TEXT (crypto.randomUUID()),
// jsonb -> TEXT (JSON.stringify/parse), timestamptz -> TEXT (ISO string,
// which is exactly what the rest of the codebase already produces via
// `new Date().toISOString()`), boolean -> INTEGER (0/1), since
// better-sqlite3 can't bind a raw JS boolean.
const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', '..', 'data', 'local.db');

if (DB_PATH !== ':memory:') {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS services (
    name TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'healthy',
    last_seen_at TEXT,
    last_latency_ms INTEGER,
    last_error_rate REAL
  );

  CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    service_name TEXT NOT NULL REFERENCES services(name),
    trigger_type TEXT NOT NULL,
    fault_type TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    diagnosed_at TEXT,
    remediated_at TEXT,
    resolved_at TEXT,
    root_cause TEXT,
    remediation_action TEXT,
    remediation_success INTEGER,
    postmortem TEXT,
    raw_context TEXT,
    is_flapping INTEGER NOT NULL DEFAULT 0,
    awaiting_approval INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS metrics_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_name TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    request_count INTEGER,
    error_count INTEGER,
    p95_latency_ms INTEGER,
    status TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_metrics_service_time ON metrics_snapshots(service_name, recorded_at DESC);
  CREATE INDEX IF NOT EXISTS idx_incidents_detected ON incidents(detected_at DESC);
`);

// CREATE TABLE IF NOT EXISTS above is a no-op against a local.db file
// that already existed before a column was added here — SQLite needs
// an explicit ALTER TABLE for that case (local.db is gitignored and
// personal-machine-only, so this is the only migration path it gets).
const incidentColumns = db.prepare('PRAGMA table_info(incidents)').all().map((c) => c.name);
if (!incidentColumns.includes('is_flapping')) {
  db.exec('ALTER TABLE incidents ADD COLUMN is_flapping INTEGER NOT NULL DEFAULT 0');
}
if (!incidentColumns.includes('awaiting_approval')) {
  db.exec('ALTER TABLE incidents ADD COLUMN awaiting_approval INTEGER NOT NULL DEFAULT 0');
}

function toIncidentRow(fields) {
  const row = { ...fields };
  if ('remediation_success' in row) {
    row.remediation_success = row.remediation_success == null ? null : row.remediation_success ? 1 : 0;
  }
  if ('is_flapping' in row) {
    row.is_flapping = row.is_flapping ? 1 : 0;
  }
  if ('awaiting_approval' in row) {
    row.awaiting_approval = row.awaiting_approval ? 1 : 0;
  }
  if ('raw_context' in row && row.raw_context != null && typeof row.raw_context === 'object') {
    row.raw_context = JSON.stringify(row.raw_context);
  }
  return row;
}

function fromIncidentRow(row) {
  if (!row) return null;
  return {
    ...row,
    remediation_success: row.remediation_success === null ? null : !!row.remediation_success,
    is_flapping: !!row.is_flapping,
    awaiting_approval: !!row.awaiting_approval,
    raw_context: row.raw_context ? JSON.parse(row.raw_context) : null,
  };
}

// services.upsert() in the Supabase driver only SETs the columns
// present in the payload, leaving everything else at its existing
// value — the poller relies on this (e.g. it omits last_seen_at when
// a service is unreachable, and expects the previous value to survive).
// This replicates that exact partial-update semantic rather than a
// fixed-column merge.
async function upsertService(name, fields) {
  const existing = db.prepare('SELECT 1 FROM services WHERE name = ?').get(name);
  if (!existing) {
    db.prepare(
      `INSERT INTO services (name, status, last_seen_at, last_latency_ms, last_error_rate)
       VALUES (@name, @status, @last_seen_at, @last_latency_ms, @last_error_rate)`
    ).run({
      name,
      status: fields.status ?? 'healthy',
      last_seen_at: fields.last_seen_at ?? null,
      last_latency_ms: fields.last_latency_ms ?? null,
      last_error_rate: fields.last_error_rate ?? null,
    });
    return;
  }

  const columns = Object.keys(fields);
  if (columns.length === 0) return;
  const setClause = columns.map((c) => `${c} = @${c}`).join(', ');
  db.prepare(`UPDATE services SET ${setClause} WHERE name = @name`).run({ name, ...fields });
}

async function listServices() {
  return db.prepare('SELECT * FROM services ORDER BY name').all();
}

async function insertMetricsSnapshot(snapshot) {
  db.prepare(
    `INSERT INTO metrics_snapshots (service_name, recorded_at, request_count, error_count, p95_latency_ms, status)
     VALUES (@service_name, @recorded_at, @request_count, @error_count, @p95_latency_ms, @status)`
  ).run({ recorded_at: new Date().toISOString(), ...snapshot });
}

async function deleteOldSnapshots() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM metrics_snapshots WHERE recorded_at < ?').run(cutoff);
}

async function getRecentSnapshots(serviceName, limit = 12) {
  return db
    .prepare('SELECT * FROM metrics_snapshots WHERE service_name = ? ORDER BY recorded_at DESC LIMIT ?')
    .all(serviceName, limit);
}

async function getUnresolvedIncident(serviceName) {
  const row = db
    .prepare('SELECT * FROM incidents WHERE service_name = ? AND resolved_at IS NULL LIMIT 1')
    .get(serviceName);
  return fromIncidentRow(row);
}

async function insertIncident(incident) {
  const id = crypto.randomUUID();
  const row = toIncidentRow({
    diagnosed_at: null,
    remediated_at: null,
    resolved_at: null,
    root_cause: null,
    remediation_action: null,
    remediation_success: null,
    postmortem: null,
    raw_context: null,
    is_flapping: false,
    awaiting_approval: false,
    ...incident,
    id,
  });
  db.prepare(
    `INSERT INTO incidents (id, service_name, trigger_type, fault_type, detected_at, diagnosed_at, remediated_at, resolved_at, root_cause, remediation_action, remediation_success, postmortem, raw_context, is_flapping, awaiting_approval)
     VALUES (@id, @service_name, @trigger_type, @fault_type, @detected_at, @diagnosed_at, @remediated_at, @resolved_at, @root_cause, @remediation_action, @remediation_success, @postmortem, @raw_context, @is_flapping, @awaiting_approval)`
  ).run(row);
  return getIncident(id);
}

async function countRecentIncidents(serviceName, sinceIso) {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM incidents WHERE service_name = ? AND detected_at >= ?')
    .get(serviceName, sinceIso);
  return row.count;
}

async function updateIncident(id, fields) {
  const row = toIncidentRow(fields);
  const columns = Object.keys(row);
  if (columns.length > 0) {
    const setClause = columns.map((c) => `${c} = @${c}`).join(', ');
    db.prepare(`UPDATE incidents SET ${setClause} WHERE id = @id`).run({ id, ...row });
  }
  return getIncident(id);
}

async function listIncidents(limit = 20) {
  const rows = db.prepare('SELECT * FROM incidents ORDER BY detected_at DESC LIMIT ?').all(limit);
  return rows.map(fromIncidentRow);
}

async function getIncident(id) {
  const row = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
  return fromIncidentRow(row);
}

module.exports = {
  upsertService,
  listServices,
  insertMetricsSnapshot,
  deleteOldSnapshots,
  getRecentSnapshots,
  getUnresolvedIncident,
  insertIncident,
  updateIncident,
  listIncidents,
  getIncident,
  countRecentIncidents,
};
