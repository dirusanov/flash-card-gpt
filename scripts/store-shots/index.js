/**
 * Builds the Chrome Web Store screenshots end to end: capture, then compose.
 *
 *   node scripts/store-shots            # everything
 *   node scripts/store-shots --compose  # re-frame the existing captures only
 *
 * Anything passed through lands on capture.js, so `--only=page2` and friends work here too.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const argv = process.argv.slice(2);
const composeOnly = argv.includes('--compose');
const passthrough = argv.filter((arg) => arg !== '--compose');

const run = (script, args = []) => {
  const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args], {
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status || 1);
};

if (!composeOnly) run('capture.js', passthrough);
run('compose.js');
