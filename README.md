# Autonomous SRE Agent

A self-healing distributed system: three microservices simulating an e-commerce order flow, a control-plane agent that detects, diagnoses (via LLM), and auto-remediates incidents, and a live dashboard with both autonomous chaos and a manual "Break It" trigger.

Full build plan lives in project notes. This README will be filled out in Phase 11 with the architecture diagram, live links, and demo instructions.

## Status

- [x] Phase 1 — Target services (order, inventory, notification) built and verified locally
- [x] Phase 2 — Deploy target services to Render (render.yaml Blueprint ready)
- [ ] Phase 3 — Chaos endpoints
- [ ] Phase 4 — Control plane: polling + detection
- [ ] Phase 5 — Diagnosis
- [ ] Phase 6 — Remediation
- [ ] Phase 7 — Postmortem generation
- [ ] Phase 8 — Break-It endpoint + dashboard
- [ ] Phase 9 — Scheduled chaos + keep-alive
- [ ] Phase 10 — Polish & metrics
- [ ] Phase 11 — Documentation & launch

## Local development

Each service under `services/` has its own `package.json`. Copy `.env.example` to `.env` and run:

```
npm install
npm run dev
```

Order flow: `order-service` (port 3001) → `inventory-service` (port 3002) → `notification-service` (port 3003).

```
curl -X POST localhost:3001/orders -H "Content-Type: application/json" -d '{"item":"blue-mug","quantity":2}'
```

## Deploying to Render (Phase 2)

`render.yaml` at the repo root is a Render **Blueprint** that deploys all 4 target services (`order-service-a`, `order-service-b`, `inventory-service`, `notification-service`) in one pass — `order-service-a`/`-b` share the same `services/order-service` source, differing only by the `REPLICA_ID` env var, per the plan's alternative to a duplicated folder.

1. Go to the [Render dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
2. Connect the `Aditya-tec/SRE-AGENT` GitHub repo (authorize Render's GitHub app if this is the first time).
3. Render detects `render.yaml` and shows all 4 services to create. Confirm and deploy.
4. Once live, each service gets a URL of the form `https://<service-name>.onrender.com`. **Verify these match** what's hardcoded in `render.yaml`'s `INVENTORY_URL`/`NOTIFICATION_URL` — if Render appended a suffix (name collision), update those two env vars in the dashboard for `order-service-a` and `order-service-b` to match the real `inventory-service` URL, then manually redeploy those two services.
5. Confirm all 4 respond: `curl https://<name>.onrender.com/health` → `200 {"status":"healthy",...}`.

Note: free-tier services sleep after ~15 min idle (first request after sleeping takes up to ~50s to wake) — this is expected until the keep-alive workflow is added in Phase 9.
