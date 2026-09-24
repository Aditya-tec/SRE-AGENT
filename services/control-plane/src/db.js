// Dependency inversion: everything else in the codebase (poller,
// diagnose, remediate, postmortem, routes) talks to this same
// interface regardless of which driver is behind it. STORAGE_DRIVER
// unset (or anything other than "sqlite") keeps exactly today's
// deployed behavior — Supabase is the default so existing deploys are
// unaffected by this file's existence.
const driver = (process.env.STORAGE_DRIVER || 'supabase').toLowerCase();

module.exports = driver === 'sqlite' ? require('./db/sqliteDriver') : require('./db/supabaseDriver');
