const db = require('./db');

// Blocks every /break-it trigger, manual or autonomous, while true —
// see breakIt.js for why manual isn't exempted.
const SETTING_KEY = 'chaos_paused';

async function isPaused() {
  const value = await db.getSetting(SETTING_KEY);
  return value === 'true';
}

async function setPaused(paused) {
  await db.setSetting(SETTING_KEY, paused ? 'true' : 'false');
}

module.exports = { isPaused, setPaused };
