process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:9999';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy-test-key';
delete process.env.GROQ_API_KEY;

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../src/db');
const { answerQuery, buildContext, buildCompletionRequest, SYSTEM_PROMPT } = require('../src/query');
const queryRoute = require('../src/routes/query');

async function withApp(run) {
  const app = express();
  app.use(express.json());
  app.use(queryRoute);
  const server = app.listen(0);
  server.unref();
  const baseUrl = `http://localhost:${server.address().port}`;
  try {
    await run(baseUrl);
  } finally {
    server.close();
  }
}

test('buildContext maps services and recent incidents into a compact JSON shape', async () => {
  db.listServices = async () => [
    { name: 'order-service-a', status: 'healthy', last_seen_at: 't1', last_latency_ms: 40, last_error_rate: 0 },
  ];
  db.listIncidents = async () => [
    {
      service_name: 'inventory-service',
      fault_type: 'latency',
      detected_at: 't2',
      resolved_at: null,
      root_cause: 'slow downstream call',
      confidence: 'high',
      remediation_action: 'restart',
      remediation_success: null,
      is_flapping: false,
    },
  ];

  const context = await buildContext();

  assert.deepEqual(context.services, [
    { name: 'order-service-a', status: 'healthy', lastSeenAt: 't1', lastLatencyMs: 40, lastErrorRate: 0 },
  ]);
  assert.equal(context.recentIncidents.length, 1);
  assert.equal(context.recentIncidents[0].serviceName, 'inventory-service');
  assert.equal(context.recentIncidents[0].rootCause, 'slow downstream call');
});

test('buildCompletionRequest never grants the model tools/functions — structurally read-only', () => {
  const request = buildCompletionRequest('what is happening with order-service', {
    services: [],
    recentIncidents: [],
  });

  assert.equal('tools' in request, false, 'no tools field means the model has no way to invoke anything');
  assert.equal('functions' in request, false);
  assert.equal(request.messages[0].content, SYSTEM_PROMPT);
  assert.equal(request.messages[1].role, 'user');
  assert.ok(
    JSON.parse(request.messages[1].content).question === 'what is happening with order-service'
  );
});

test('system prompt explicitly forbids taking action, even when asked', () => {
  assert.match(SYSTEM_PROMPT, /no ability to take any action/i);
  assert.match(SYSTEM_PROMPT, /cannot\s+restart/i);
});

test('answerQuery falls back to a safe default when GROQ_API_KEY is unset', async () => {
  db.listServices = async () => [];
  db.listIncidents = async () => [];

  const result = await answerQuery('restart order-service');

  assert.equal(result.answer, "I can't answer that right now — the status assistant is temporarily unavailable.");
});

test('POST /query 400s on a missing question', async () => {
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /query 400s on an oversized question', async () => {
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'x'.repeat(301) }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /query answers a well-formed question without exposing internals beyond `answer`', async () => {
  db.listServices = async () => [];
  db.listIncidents = async () => [];

  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'what is happening with order-service' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(Object.keys(body), ['answer']);
  });
});

test('POST /query never triggers remediation, even when the question asks it to', async () => {
  db.listServices = async () => [];
  db.listIncidents = async () => [];

  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'restart order-service right now' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    // No GROQ_API_KEY in the test env, so this exercises the fallback
    // path — the real guarantee (no tools/functions given to the
    // model) is asserted directly against buildCompletionRequest above.
    assert.equal(typeof body.answer, 'string');
    assert.doesNotMatch(body.answer.toLowerCase(), /restarted|restarting now|done\b/);
  });
});
