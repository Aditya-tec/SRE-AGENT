const Groq = require('groq-sdk');

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_TIMEOUT_MS = 10000;

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

const SYSTEM_PROMPT = `Write a concise incident postmortem in markdown, under 200 words, with
sections: Summary, Timeline, Root Cause, Resolution, Follow-up. Use the
provided timestamps and root cause. Plain, factual tone, no filler.`;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Groq call timed out')), ms)),
  ]);
}

function fallbackPostmortem(incident) {
  return `## Summary
${incident.service_name} experienced a ${incident.fault_type} incident (${incident.trigger_type} trigger).

## Timeline
- Detected: ${incident.detected_at}
- Diagnosed: ${incident.diagnosed_at || 'n/a'}
- Remediated: ${incident.remediated_at || 'n/a'}
- Resolved: ${incident.resolved_at || 'n/a'}

## Root Cause
${incident.root_cause || 'Unknown (diagnosis unavailable)'}

## Resolution
Action taken: ${incident.remediation_action || 'none'} (${incident.remediation_success ? 'succeeded' : 'did not fully succeed'}).

## Follow-up
Postmortem generation via LLM was unavailable; this is an auto-templated summary.`;
}

async function generatePostmortem(incident) {
  if (!groq) {
    console.error('[postmortem] GROQ_API_KEY not set, using templated fallback');
    return fallbackPostmortem(incident);
  }

  try {
    const completion = await withTimeout(
      groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              service_name: incident.service_name,
              fault_type: incident.fault_type,
              trigger_type: incident.trigger_type,
              detected_at: incident.detected_at,
              diagnosed_at: incident.diagnosed_at,
              remediated_at: incident.remediated_at,
              resolved_at: incident.resolved_at,
              root_cause: incident.root_cause,
              remediation_action: incident.remediation_action,
              remediation_success: incident.remediation_success,
            }),
          },
        ],
      }),
      GROQ_TIMEOUT_MS
    );

    const text = completion.choices[0].message.content.trim();
    if (!text) throw new Error('empty postmortem response');
    return text;
  } catch (err) {
    console.error('[postmortem] Groq call failed, using templated fallback:', err.message);
    return fallbackPostmortem(incident);
  }
}

module.exports = { generatePostmortem };
