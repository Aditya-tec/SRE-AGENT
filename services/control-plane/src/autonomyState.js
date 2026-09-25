const db = require('./db');

const SETTING_KEY = 'autonomous_chaos_paused';

async function isPaused() {
  const value = await db.getSetting(SETTING_KEY);
  return value === 'true';
}

async function setPaused(paused) {
  await db.setSetting(SETTING_KEY, paused ? 'true' : 'false');
}

module.exports = { isPaused, setPaused };
