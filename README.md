# Autonomous SRE Agent

A self-healing distributed system: three microservices simulating an e-commerce order flow, a control-plane agent that detects, diagnoses (via LLM), and auto-remediates incidents, and a live dashboard with both autonomous chaos and a manual "Break It" trigger.

Full build plan lives in project notes. This README will be filled out in Phase 11 with the architecture diagram, live links, and demo instructions.

## Status

- [x] Phase 1 — Target services (order, inventory, notification) built and verified locally
- [ ] Phase 2 — Deploy target services to Render
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
