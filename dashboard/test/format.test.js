const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDuration, formatTimestamp } = require('../lib/format');

test('formatDuration returns an em-dash when either timestamp is missing', () => {
  assert.equal(formatDuration(null, '2026-01-01T00:00:01Z'), '—');
  assert.equal(formatDuration('2026-01-01T00:00:00Z', null), '—');
  assert.equal(formatDuration(undefined, undefined), '—');
});

test('formatDuration renders sub-second durations in ms', () => {
  assert.equal(formatDuration('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.500Z'), '500ms');
});

test('formatDuration renders longer durations in seconds, one decimal', () => {
  assert.equal(formatDuration('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:38.400Z'), '38.4s');
});

test('formatTimestamp returns an em-dash for a missing value', () => {
  assert.equal(formatTimestamp(null), '—');
  assert.equal(formatTimestamp(undefined), '—');
});

test('formatTimestamp returns a non-empty formatted string for a valid ISO date', () => {
  const result = formatTimestamp('2026-09-22T16:30:00.000Z');
  assert.ok(result.length > 0);
  assert.notEqual(result, '—');
});
