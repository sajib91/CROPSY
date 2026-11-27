#!/usr/bin/env node

/**
 * Verifies that every web/mobile API address is derived from, or resolves to,
 * a published OpenAPI 3.1 operation. This is a build-time companion to the
 * runtime contract checks in the client request helpers.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const contracts = require('@cropsy/api-contracts');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const checks = [];

const DUMMY_ID = '00000000-0000-4000-8000-000000000001';
const HTTP_METHODS = Object.freeze({
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
});

function addError(message) {
  errors.push(message);
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function walk(directory, predicate = () => true) {
  const results = [];
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...walk(relativePath, predicate));
    else if (predicate(entry.name)) results.push(relativePath);
  }
  return results;
}

function assertImports(file, names) {
  const source = read(file);
  for (const name of names) {
    if (!new RegExp(`\\b${name}\\b`).test(source)) {
      addError(`${file} must use the generated contract helper '${name}'.`);
    }
  }
}

function checkSpecInventory() {
  const spec = contracts.openApiSpec;
  if (spec.openapi !== '3.1.0')
    addError(`Canonical spec must be OpenAPI 3.1.0, found ${spec.openapi}.`);
  if (!Array.isArray(contracts.apiOperations) || contracts.apiOperations.length === 0) {
    addError('Generated operation inventory is empty.');
    return;
  }
  const operationPaths = new Set();
  for (const operation of contracts.apiOperations) {
    if (!operation.operationId || !operation.method || !operation.path) {
      addError(`Invalid generated operation: ${JSON.stringify(operation)}`);
    }
    operationPaths.add(operation.path);
  }
  if (!operationPaths.has('/health') || !operationPaths.has('/version')) {
    addError('Generated contract inventory is missing public platform routes.');
  }
  checks.push(`spec inventory: ${contracts.apiOperations.length} operations`);
}

function loadMobileEndpoints() {
  const file = path.join(root, 'apps/mobile/src/lib/api/endpoints.js');
  const source = fs
    .readFileSync(file, 'utf8')
    .replace(
      /^import\s*\{([^}]+)\}\s*from\s*'@cropsy\/api-contracts';$/m,
      'const {$1} = contracts;',
    )
    .replace(/^export\s+const\s+endpoints\s*=/m, 'const endpoints =');
  const context = {
    contracts,
    console,
    encodeURIComponent,
    module: { exports: {} },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(`${source}\nmodule.exports = { endpoints };\n`, context, {
    filename: 'apps/mobile/src/lib/api/endpoints.js',
  });
  return context.module.exports.endpoints;
}

function resolveEndpoint(endpoints, alias) {
  let value = endpoints;
  for (const part of alias.split('.')) value = value?.[part];
  if (typeof value === 'function') value = value(DUMMY_ID);
  return value;
}

function checkMobileEndpoints() {
  const endpoints = loadMobileEndpoints();
  let aliasCount = 0;
  const walkEndpoints = (value, prefix = '') => {
    for (const [key, item] of Object.entries(value)) {
      const name = `${prefix}${key}`;
      if (typeof item === 'string') {
        aliasCount += 1;
        try {
          contracts.requireApiPath(item);
        } catch (error) {
          addError(`mobile endpoint '${name}': ${error.message}`);
        }
      } else if (typeof item === 'function') {
        aliasCount += 1;
        try {
          contracts.requireApiPath(item(DUMMY_ID));
        } catch (error) {
          addError(`mobile endpoint '${name}': ${error.message}`);
        }
      } else if (item && typeof item === 'object') {
        walkEndpoints(item, `${name}.`);
      }
    }
  };
  walkEndpoints(endpoints);

  let callCount = 0;
  for (const file of walk('apps/mobile/src', (name) => /\.(js|jsx)$/.test(name))) {
    if (file.endsWith('endpoints.js')) continue;
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const pattern = /api\.(get|post|put|patch|delete)\(\s*endpoints\.([A-Za-z0-9_.]+)(\([^)]*\))?/g;
    for (const match of source.matchAll(pattern)) {
      callCount += 1;
      const method = HTTP_METHODS[match[1].toUpperCase()];
      const value = resolveEndpoint(endpoints, match[2]);
      try {
        contracts.requireApiOperation(method, value);
      } catch (error) {
        addError(`${file}: ${match[0].slice(0, 100)} -> ${error.message}`);
      }
    }
  }
  checks.push(`mobile endpoints: ${aliasCount} aliases, ${callCount} call sites`);
}

function literalPath(match) {
  return match
    .replace(/\\(.)/g, '$1')
    .replace(/\$\{[^}]*\}/g, DUMMY_ID)
    .replace(/\{[A-Za-z_][\w]*\}/g, DUMMY_ID);
}

function checkWebHelperCalls() {
  const helpers = Object.freeze({
    dashboardGet: 'GET',
    dashboardPost: 'POST',
    dashboardPatch: 'PATCH',
    dashboardDelete: 'DELETE',
    useDashboardQuery: 'GET',
    fetchPublic: 'GET',
  });
  let callCount = 0;
  for (const file of walk('apps/web', (name) => /\.(js|jsx)$/.test(name))) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const names = Object.keys(helpers).join('|');
    const pattern = new RegExp(`\\b(${names})\\(\\s*(['"\`])((?:\\\\.|(?!\\2)[\\s\\S])*?)\\2`, 'g');
    for (const match of source.matchAll(pattern)) {
      const apiPath = literalPath(match[3]);
      if (!apiPath.startsWith('/') || apiPath.startsWith('/api/')) continue;
      callCount += 1;
      try {
        contracts.requireApiOperation(helpers[match[1]], apiPath);
      } catch (error) {
        addError(`${file}: ${match[1]}(${match[3]}) -> ${error.message}`);
      }
    }
  }
  checks.push(`web helper calls: ${callCount} literal paths`);
}

function checkWebRoleConfig() {
  const source = read('apps/web/lib/dashboards/roles.js');
  let count = 0;
  for (const match of source.matchAll(/(?:endpoint|path):\s*(['"`])([^'"`]+)\1/g)) {
    count += 1;
    try {
      contracts.requireApiPath(literalPath(match[2]));
    } catch (error) {
      addError(`apps/web/lib/dashboards/roles.js: ${match[2]} -> ${error.message}`);
    }
  }
  checks.push(`web role config: ${count} paths`);
}

function checkWebProxyRoutes() {
  let count = 0;
  for (const file of walk('apps/web/app/api', (name) => name === 'route.js')) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    if (!source.includes('proxyApiRequest')) continue;
    const exportedMethods = [
      ...source.matchAll(/export\s+(?:const|async\s+function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g),
    ].map((match) => match[1]);
    for (const match of source.matchAll(
      /proxyApiRequest\(\s*request,\s*\{[\s\S]*?\bpath:\s*(['"`])([^'"`]+)\1/g,
    )) {
      // Dynamic catch-all proxies are validated at runtime by proxyApiRequest,
      // which resolves the concrete path against the generated inventory.
      if (match[2].includes('${')) continue;
      count += 1;
      const apiPath = literalPath(match[2]);
      let resolved = false;
      for (const method of exportedMethods.length > 0 ? exportedMethods : ['GET']) {
        try {
          contracts.requireApiOperation(method, apiPath);
          resolved = true;
          break;
        } catch {
          // Try the next exported method.
        }
      }
      if (!resolved) addError(`${file}: no OpenAPI operation for proxy path ${apiPath}.`);
    }
  }
  checks.push(`web proxy literals: ${count} paths`);
}

function checkRuntimeGuards() {
  const guarded = [
    ['apps/mobile/src/lib/api/endpoints.js', ['contractPath']],
    ['apps/mobile/src/lib/api/client.js', ['requireApiOperation', 'contractPath']],
    ['apps/web/lib/dashboard/client.js', ['requireApiOperation']],
    ['apps/web/lib/auth/server.js', ['requireApiOperation']],
    ['apps/web/lib/platform-api.js', ['contractPath', 'requireApiOperation']],
  ];
  for (const [file, names] of guarded) assertImports(file, names);
  checks.push(`runtime guards: ${guarded.length} client entry points`);
}

checkSpecInventory();
checkMobileEndpoints();
checkWebHelperCalls();
checkWebRoleConfig();
checkWebProxyRoutes();
checkRuntimeGuards();

if (errors.length > 0) {
  console.error(`Client contract check failed (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Client contracts valid: ${checks.join('; ')}.`);
}
