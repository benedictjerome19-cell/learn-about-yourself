#!/usr/bin/env node
// Development: run the API (auto-restarts on change) and the Vite client together.
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const children = [];

const run = (label, cmd, args, cwd) => {
  const p = spawn(cmd, args, { cwd, shell: true, stdio: 'pipe' });
  p.stdout.on('data', d => process.stdout.write(`[${label}] ${d}`));
  p.stderr.on('data', d => process.stderr.write(`[${label}] ${d}`));
  p.on('close', code => console.log(`[${label}] exited ${code}`));
  children.push(p);
};

run('server', 'npm', ['run', 'dev'], path.join(ROOT, 'server'));
run('client', 'npm', ['run', 'dev'], path.join(ROOT, 'client'));

const stop = () => { children.forEach((c) => c.kill()); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

console.log('\n📓 JournalMind starting…');
console.log('   App  → http://localhost:5173');
console.log('   API  → http://localhost:4000\n');
