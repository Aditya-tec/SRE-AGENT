// Groq's SDK sets `status` on API errors (RateLimitError, AuthenticationError,
// etc. all extend APIError with `this.status` set in the constructor — see
// groq-sdk/error.js). Our own withTimeout() rejection is a plain Error with
// no status, identified by message instead.
function describeGroqError(err) {
  if (err && err.status === 429) return 'Groq rate limit or quota exceeded';
  if (err && err.status === 401) return 'Groq API key invalid or missing';
  if (err && err.message === 'Groq call timed out') return 'Groq call timed out';
  return 'LLM call failed';
}

module.exports = { describeGroqError };
