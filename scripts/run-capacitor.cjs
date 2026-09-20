const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const mobileRoot = path.join(repositoryRoot, 'apps', 'mobile');
const capacitorCli = require.resolve('@capacitor/cli/bin/capacitor');
const args = process.argv.slice(2);

const result = spawnSync(process.execPath, [capacitorCli, ...args], {
  cwd: mobileRoot,
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
