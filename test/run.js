// Test runner: executes each test file in its own process and aggregates the
// exit status. Used by `npm test`.
const { spawnSync } = require('child_process');
const path = require('path');

const files = ['smoke.test.js', 'idb.test.js', 'share.test.js'];
let failed = false;

for (const f of files) {
  console.log('\n=== ' + f + ' ===');
  const res = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
  if (res.status !== 0) failed = true;
}

console.log('\n' + (failed ? 'TESTS FAILED' : 'ALL TEST FILES PASSED'));
process.exit(failed ? 1 : 0);
