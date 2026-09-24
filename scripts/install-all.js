// A plain loop over child_process, not shell-chained `cd X && npm i`,
// so this behaves identically on Windows (cmd/PowerShell) and POSIX
// shells regardless of npm's configured script-shell.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const DIRS = [
  'services/order-service',
  'services/inventory-service',
  'services/notification-service',
  'services/control-plane',
  'dashboard',
];

for (const dir of DIRS) {
  const cwd = path.resolve(__dirname, '..', dir);
  console.log(`\n> npm install (${dir})`);
  execFileSync('npm', ['install'], { cwd, stdio: 'inherit', shell: true });
}

console.log('\nAll services installed.');
