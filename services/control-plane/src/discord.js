const logger = require('./logger');

async function notifyDiscord(message) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
  } catch (err) {
    logger.error({ err }, 'discord webhook call failed');
  }
}

module.exports = { notifyDiscord };
