#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = process.argv.slice(2);
const extensions = new Set(['.js', '.mjs', '.cjs']);
const ignoredDirs = new Set([
  'node_modules',
  '.next',
  '.expo',
  'dist',
  'coverage',
  '.venv',
  '__pycache__',
]);

if (targets.length === 0) {
  console.error('Usage: node scripts/check-syntax.mjs <file-or-directory> [...]');
  process.exit(1);
}

function resolveTarget(target) {
  const fromCwd = path.resolve(process.cwd(), target);
  return existsSync(fromCwd) ? fromCwd : path.resolve(root, target);
}

function collect(target) {
  const absolute = resolveTarget(target);
  const stat = statSync(absolute);

  if (stat.isFile()) {
    return extensions.has(path.extname(absolute)) ? [absolute] : [];
  }

  const files = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        files.push(...collect(path.join(absolute, entry.name)));
      }
    } else if (extensions.has(path.extname(entry.name))) {
      files.push(path.join(absolute, entry.name));
    }
  }
  return files;
}

const files = [...new Set(targets.flatMap(collect))].sort();

if (files.length === 0) {
  console.error('No JavaScript files found in the requested target(s).');
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed += 1;
}

if (failed > 0) {
  console.error(`Syntax check failed for ${failed} file(s).`);
  process.exit(1);
}

console.log(`Syntax OK: ${files.length} file(s).`);
