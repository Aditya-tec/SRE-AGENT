// Render auto-restarts a crashed free-tier service within seconds;
// nothing does that on a local machine. Without this, a `crash` chaos
// fault would kill a service permanently in local dev mode, and the
// resulting incident could never actually reach Resolved — only
// Unresolved. This is a minimal stand-in for that behavior: restart
// the child process shortly after it exits, indefinitely.
const { spawn } = require('node:child_process');
const path = require('node:path');

const [, , serviceDir] = process.argv;
if (!serviceDir) {
  console.error('Usage: node scripts/supervise.js <path-to-service-directory>');
  process.exit(1);
}

const cwd = path.resolve(__dirname, '..', serviceDir);
// Must reliably exceed 2 poll cycles (the poller's 5s interval x its
// 2-cycle detection debounce = 10s) — otherwise a crash can recover
// faster than the poller ever sees it down, and no incident opens at
// all. 12s guarantees at least 2 consecutive down polls while still
// recovering far faster than Render's real ~30-50s cold start.
const RESTART_DELAY_MS = 12000;

function start() {
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    console.log(`[supervise] ${serviceDir} exited (code=${code} signal=${signal}) — restarting in ${RESTART_DELAY_MS}ms`);
    setTimeout(start, RESTART_DELAY_MS);
  });
}

start();
