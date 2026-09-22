# Autonomous SRE Agent

A self-healing distributed system: three microservices simulating an e-commerce order flow, a control-plane agent that detects, diagnoses (via LLM), and auto-remediates incidents, and a live dashboard with both autonomous chaos and a manual "Break It" trigger.

Full build plan lives in project notes. This README will be filled out in Phase 11 with the architecture diagram, live links, and demo instructions.

## Status

- [x] Phase 1 — Target services (order, inventory, notification) built and verified locally
- [x] Phase 2 — Deploy target services to Render (render.yaml Blueprint ready)
- [x] Phase 3 — Chaos endpoints
- [x] Phase 4 — Control plane: polling + detection (code complete, needs a live Supabase project to persist)
- [x] Phase 5 — Diagnosis (code complete, needs a `GROQ_API_KEY` to exercise the real LLM call — fallback path verified)
- [x] Phase 6 — Remediation (full state machine verified locally: restart/traffic_shift/rate_limit, retry-to-max-attempts, and recovery-to-Resolved)
- [x] Phase 7 — Postmortem generation (fallback template verified; real Groq output needs `GROQ_API_KEY`)
- [x] Phase 8 — Break-It endpoint + dashboard (built, verified visually with a mock API — needs a live control plane + Vercel deploy)
- [ ] Phase 9 — Scheduled chaos + keep-alive
- [ ] Phase 10 — Polish & metrics
- [ ] Phase 11 — Documentation & launch

## Local development

Each service under `services/` has its own `package.json`. Copy `.env.example` to `.env` and run:

```
npm install
npm run dev
```

Order flow: `order-service` (port 3001) → `inventory-service` (port 3002) → `notification-service` (port 3003). Each service also exposes `POST /chaos` (`{"type":"latency"|"error_rate"|"crash","durationSec":30}`) and `GET /chaos/status`.

```
curl -X POST localhost:3001/orders -H "Content-Type: application/json" -d '{"item":"blue-mug","quantity":2}'
```

`services/control-plane` polls all 4 target services every 5s, writes to Supabase, and opens an incident once an anomaly persists for 2 consecutive polls. It requires `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` to start (see below) and defaults its target URLs to `localhost:3001/3011/3002/3003` for local dev (3011 is where a local `order-service-b` would run, e.g. `PORT=3011 REPLICA_ID=b npm run dev`).

On startup it also runs a synthetic traffic generator (a random order every 2-4s through its own `POST /gateway/orders`) so the anomaly detector always has real request volume to measure against, and an incident state machine: **Detected → Diagnosing (Groq) → Remediating (restart via Render API / traffic_shift / rate_limit) → Verifying → Resolved**, retrying up to 3 times before marking an incident `Unresolved`. Real traffic should always go through `/gateway/orders` on the control plane, never straight at `order-service-a`/`-b`, or `traffic_shift` has nothing real to redirect.

## Setting up Supabase (Phase 4)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql) once — creates `services`, `incidents`, `metrics_snapshots`.
3. From Project Settings → API, copy the **Project URL** and the **`service_role` secret key** (not `anon`) into `control-plane`'s `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`. The `service_role` key must stay server-side only — never expose it to the dashboard.

## Deploying to Render (Phases 2 & 4)

`render.yaml` at the repo root is a Render **Blueprint** that deploys all 5 services (`order-service-a`, `order-service-b`, `inventory-service`, `notification-service`, `control-plane`) in one pass — `order-service-a`/`-b` share the same `services/order-service` source, differing only by the `REPLICA_ID` env var, per the plan's alternative to a duplicated folder.

1. Go to the [Render dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
2. Connect the `Aditya-tec/SRE-AGENT` GitHub repo (authorize Render's GitHub app if this is the first time).
3. Render detects `render.yaml` and shows all 5 services to create. Confirm and deploy.
4. Once live, each service gets a URL of the form `https://<service-name>.onrender.com`. **Verify these match** what's hardcoded in the blueprint's `INVENTORY_URL`/`NOTIFICATION_URL`/`ORDER_A_URL`/`ORDER_B_URL` values — if Render appended a suffix (name collision), update the affected env vars in the dashboard and redeploy.
5. `control-plane` has several env vars marked `sync: false` (secrets Render won't store in the repo) — fill these in manually in the dashboard after first sync: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (from the Supabase setup above), `GROQ_API_KEY` (Phase 5), `RENDER_API_KEY` + `RENDER_SERVICE_IDS` (Phase 6), `DISCORD_WEBHOOK_URL` (optional).
6. Confirm all 5 respond: `curl https://<name>.onrender.com/health` → `200 {"status":"healthy",...}`.

Note: free-tier services sleep after ~15 min idle (first request after sleeping takes up to ~50s to wake) — this is expected until the keep-alive workflow is added in Phase 9.

## Deploying the dashboard to Vercel (Phase 8)

`dashboard/` is a Next.js (App Router) app — `POST /break-it` on the control plane, plus `GET /services`, `GET /incidents`, `GET /incidents/:id`, are the only APIs it talks to (never Supabase directly, keeping the `service_role` key server-side only).

1. [vercel.com](https://vercel.com) → **New Project** → same `Aditya-tec/SRE-AGENT` repo → set **Root Directory** to `dashboard`.
2. Framework preset: Next.js (auto-detected).
3. Env var: `NEXT_PUBLIC_CONTROL_PLANE_URL` = the `control-plane` Render URL from the deploy above.
4. Deploy. The dashboard polls `/services` every 5s and `/incidents` every 3s while any incident is unresolved (else every 15s).

Local dev: `cd dashboard && npm install && npm run dev`, with `NEXT_PUBLIC_CONTROL_PLANE_URL` in `.env.local` pointing at a running `control-plane` (defaults to `http://localhost:3000` — adjust if that port is taken locally, e.g. `PORT=3005 npm start` in `control-plane` and `NEXT_PUBLIC_CONTROL_PLANE_URL=http://localhost:3005`).

The **Break It** button offers a curated, safe subset (crash order-service / slow down inventory-service / error-storm notification-service), calls `POST /break-it`, and the timeline below picks up the resulting incident within a few seconds. Verified locally against a mock of the control-plane API: service health grid, stat tiles, incident timeline, Break-It dropdown + toast, and the incident detail page (timeline, root-cause callout, markdown-rendered postmortem) all render correctly with zero console errors.
