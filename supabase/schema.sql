create table services (
  name text primary key,
  status text not null default 'healthy',
  last_seen_at timestamptz,
  last_latency_ms integer,
  last_error_rate numeric
);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  service_name text not null references services(name),
  trigger_type text not null,
  fault_type text not null,
  detected_at timestamptz not null default now(),
  diagnosed_at timestamptz,
  remediated_at timestamptz,
  resolved_at timestamptz,
  root_cause text,
  remediation_action text,
  remediation_success boolean,
  postmortem text,
  raw_context jsonb,
  is_flapping boolean not null default false,
  awaiting_approval boolean not null default false,
  confidence text
);

create table metrics_snapshots (
  id bigint generated always as identity primary key,
  service_name text not null,
  recorded_at timestamptz not null default now(),
  request_count integer,
  error_count integer,
  p95_latency_ms integer,
  status text
);

create index idx_metrics_service_time on metrics_snapshots(service_name, recorded_at desc);
create index idx_incidents_detected on incidents(detected_at desc);
