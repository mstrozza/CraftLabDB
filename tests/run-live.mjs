import { spawn } from 'node:child_process';
import { validateLiveEnvironment } from './support/live-preflight.mjs';

try {
  validateLiveEnvironment(process.env);
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
  process.exit();
}

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const child = spawn(command, ['exec', 'playwright', 'test', '--project=live'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, LIVE_E2E_PREFLIGHT_OK: '1' },
});
child.on('error', (error) => { console.error(`Live runner: ${error.message}`); process.exitCode = 2; });
child.on('exit', (code) => { process.exitCode = code ?? 2; });
