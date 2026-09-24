const Groq = require('groq-sdk');
const db = require('./db');

// llama-3.3-70b-versatile was retired from Groq's catalog (confirmed via
// GET /openai/v1/models against a live key — it 404s, silently forcing
// every diagnosis onto the fallback path even with a valid GROQ_API_KEY).
// gpt-oss-120b is Groq's current general-purpose model in that tier.
const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_TIMEOUT_MS = 10000;

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

const SYSTEM_PROMPT = `You are an SRE agent diagnosing a production incident. You will be given
a JSON snapshot of recent metrics for the affected service and its
immediate dependencies. Respond with ONLY a JSON object, no prose outside it:
{
  "rootCause": "<one plain-English sentence, specific, e.g. 'order-service-a
   stopped responding to health checks at 10:14:32, consistent with a
   process crash, not a network issue since order-service-b remained healthy'>",
  "confidence": "high" | "medium" | "low",
  "recommendedAction": "restart" | "traffic_shift" | "rate_limit" | "monitor"
}
Base your diagnosis only on the data given. Do not invent metrics not present.

When more than one service in the chain shows abnormal metrics, identify
which service is the ROOT CAUSE and which are showing DOWNSTREAM SYMPTOMS
of depending on it (e.g. order-service showing high latency because it is
waiting on a slow inventory-service, not because it is unhealthy itself).
Name the root-cause service explicitly and explain the causal chain in
one sentence.`;

// Immediate upstream/downstream neighbors per service, used to pull
// same-window telemetry for cross-service (correlated) diagnosis.
const CALL_CHAIN = {
  'order-service-a': ['inventory-service', 'notification-service'],
  'order-service-b': ['inventory-service', 'notification-service'],
  'inventory-service': ['order-service-a', 'order-service-b'],
  'notification-service': ['order-service-a', 'order-service-b'],
};

const FALLBACK_DIAGNOSIS = {
  rootCause: 'Diagnosis unavailable — LLM call failed',
  confidence: 'low',
  recommendedAction: 'restart',
};

async function buildContext(incident) {
  const neighbors = CALL_CHAIN[incident.service_name] || [];
  const servicesToFetch = [incident.service_name, ...neighbors];

  const recentMetrics = {};
  await Promise.all(
    servicesToFetch.map(async (name) => {
      recentMetrics[name] = await db.getRecentSnapshots(name, 12);
    })
  );

  return {
    affectedService: incident.service_name,
    faultType: incident.fault_type,
    recentMetrics,
  };
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Groq call timed out')), ms)),
  ]);
}

async function diagnose(incident) {
  const context = await buildContext(incident);

  if (!groq) {
    console.error('[diagnose] GROQ_API_KEY not set, using fallback diagnosis');
    return { ...FALLBACK_DIAGNOSIS, context };
  }

  try {
    const completion = await withTimeout(
      groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(context) },
        ],
        response_format: { type: 'json_object' },
      }),
      GROQ_TIMEOUT_MS
    );

    const raw = completion.choices[0].message.content;
    const parsed = JSON.parse(raw);

    if (!parsed.rootCause || !parsed.recommendedAction) {
      throw new Error('Groq response missing required fields');
    }

    return { ...parsed, context };
  } catch (err) {
    console.error('[diagnose] Groq call failed, falling back:', err.message);
    return { ...FALLBACK_DIAGNOSIS, context };
  }
}

module.exports = { diagnose, buildContext, CALL_CHAIN };
