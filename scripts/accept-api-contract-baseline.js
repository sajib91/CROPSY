#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SPEC_FILE = path.join(ROOT_DIR, 'packages/api-contracts/openapi.json');
const BASELINE_FILE = path.join(ROOT_DIR, 'packages/api-contracts/contract-baseline.json');

if (!fs.existsSync(SPEC_FILE)) {
  console.error('Generate the OpenAPI spec before accepting a baseline.');
  process.exit(1);
}

fs.copyFileSync(SPEC_FILE, BASELINE_FILE);
console.log(`Accepted current OpenAPI contract as ${path.relative(ROOT_DIR, BASELINE_FILE)}`);
