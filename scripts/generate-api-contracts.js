#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  generateOpenApi,
  operationsFromSpec,
  typeScriptDeclarations,
} = require('./lib/api-contract-generation');

const ROOT_DIR = path.resolve(__dirname, '..');
const CONTRACTS_DIR = path.join(ROOT_DIR, 'packages/api-contracts');
const GENERATED_DIR = path.join(CONTRACTS_DIR, 'generated');

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function format(file, contents) {
  // Generated artifacts are checked by `npm run format:check`; formatting them
  // here keeps regeneration byte-for-byte stable.
  const prettier = await import('prettier');
  const config = (await prettier.resolveConfig(file)) || {};
  return prettier.format(contents, { ...config, filepath: file });
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const spec = await generateOpenApi();
  const operations = operationsFromSpec(spec);

  const specFile = path.join(CONTRACTS_DIR, 'openapi.json');
  const operationsFile = path.join(GENERATED_DIR, 'operations.json');
  const declarationsFile = path.join(GENERATED_DIR, 'client.d.ts');

  const outputs = new Map([
    [specFile, await format(specFile, json(spec))],
    [
      operationsFile,
      await format(operationsFile, json({ apiVersion: 'v1', basePath: '/api/v1', operations })),
    ],
    [declarationsFile, await format(declarationsFile, typeScriptDeclarations(operations))],
  ]);

  const mismatches = [];
  for (const [file, contents] of outputs) {
    if (checkOnly) {
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      if (current !== contents) mismatches.push(path.relative(ROOT_DIR, file));
      continue;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }

  if (checkOnly && mismatches.length > 0) {
    console.error('API contract artifacts are stale:');
    for (const file of mismatches) console.error(`  ${file}`);
    console.error('Run `npm run contracts:generate` and review the diff.');
    process.exitCode = 1;
    return;
  }

  if (checkOnly) {
    console.log(
      `API contracts current: ${operations.length} operations, ${Object.keys(spec.paths).length} paths.`,
    );
    return;
  }
  for (const file of outputs.keys()) console.log(`Wrote ${path.relative(ROOT_DIR, file)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
