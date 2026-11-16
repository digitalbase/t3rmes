import { spawn } from 'node:child_process';

const fatalPatterns = [
  'Cannot find module',
  'MODULE_NOT_FOUND',
  'Uncaught Error',
  'Uncaught TypeError',
  'Uncaught ReferenceError',
];

const child = spawn(process.execPath, ['node_modules/electron/cli.js', '.'], {
  cwd: process.cwd(),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, ELECTRON_ENABLE_LOGGING: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });

const timeout = setTimeout(() => child.kill('SIGTERM'), 6000);
child.on('exit', (code, signal) => {
  clearTimeout(timeout);
  const failures = fatalPatterns.filter((pattern) => output.includes(pattern));
  if (failures.length > 0) {
    console.error(`Desktop smoke test failed: ${failures.join(', ')}`);
    console.error(output);
    process.exit(1);
  }
  if (signal && signal !== 'SIGTERM') {
    console.error(`Desktop smoke test exited with ${signal}`);
    console.error(output);
    process.exit(1);
  }
  console.log('Desktop smoke test passed.');
});
