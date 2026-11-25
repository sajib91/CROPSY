#!/usr/bin/env node

import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] || 'apps/mobile';
const mobileDir = path.resolve(root, target);
const requireFromMobile = createRequire(path.join(mobileDir, 'package.json'));

const babel = requireFromMobile('@babel/core');
const expoPreset = requireFromMobile('babel-preset-expo');
const nativewindPreset = requireFromMobile('nativewind/babel');
const reanimatedPlugin = requireFromMobile('react-native-reanimated/plugin');

const ignoredDirs = new Set(['node_modules', '.expo', 'dist', 'coverage', '.venv']);

function collect(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) files.push(...collect(fullPath));
    } else if (entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = [...new Set(collect(mobileDir))].sort();

if (files.length === 0) {
  console.error(`No JavaScript files found in ${mobileDir}.`);
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  try {
    babel.transformFileSync(file, {
      babelrc: false,
      configFile: false,
      presets: [[expoPreset, { jsxImportSource: 'nativewind' }], nativewindPreset],
      plugins: [reanimatedPlugin],
    });
  } catch (error) {
    failed += 1;
    console.error(`Failed to transform ${path.relative(root, file)}:`);
    console.error(error instanceof Error ? error.message : error);
  }
}

if (failed > 0) {
  console.error(`Mobile syntax check failed for ${failed} file(s).`);
  process.exit(1);
}

console.log(`Mobile syntax OK: ${files.length} file(s).`);
