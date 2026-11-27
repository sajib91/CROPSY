#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CURRENT_FILE = path.join(ROOT_DIR, 'packages/api-contracts/openapi.json');
const BASELINE_FILE = path.join(ROOT_DIR, 'packages/api-contracts/contract-baseline.json');
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function deref(spec, schema, seen = new Set()) {
  if (!schema || typeof schema !== 'object') return {};
  if (!schema.$ref) return schema;
  if (seen.has(schema.$ref)) return {};
  seen.add(schema.$ref);
  const name = schema.$ref.split('/').pop();
  return deref(spec, spec.components?.schemas?.[name], seen);
}

function parameters(operation) {
  return (operation.parameters || []).filter((parameter) => !parameter.$ref);
}

function parameterMap(operation, location) {
  return new Map(
    parameters(operation)
      .filter((parameter) => parameter.in === location)
      .map((parameter) => [parameter.name, parameter]),
  );
}

function successStatuses(operation) {
  return new Set(Object.keys(operation.responses || {}).filter((status) => /^2\d\d$/.test(status)));
}

function schemaDifferences(spec, before, after, location, changes) {
  const a = deref(spec, before);
  const b = deref(spec, after);

  if (a.type && b.type && a.type !== b.type) {
    changes.push(`${location}: type changed from ${a.type} to ${b.type}`);
  }
  if (a.enum && b.enum) {
    const removed = a.enum.filter((value) => !b.enum.includes(value));
    if (removed.length > 0) {
      changes.push(`${location}: enum values removed (${removed.join(', ')})`);
    }
  }
  if (a.const !== undefined && b.const !== undefined && a.const !== b.const) {
    changes.push(`${location}: constant value changed`);
  }

  const beforeProperties = a.properties || {};
  const afterProperties = b.properties || {};
  for (const [name, schema] of Object.entries(beforeProperties)) {
    if (!Object.prototype.hasOwnProperty.call(afterProperties, name)) {
      changes.push(`${location}.${name}: property removed`);
      continue;
    }
    schemaDifferences(spec, schema, afterProperties[name], `${location}.${name}`, changes);
  }
  const beforeRequired = new Set(a.required || []);
  const afterRequired = new Set(b.required || []);
  for (const name of afterRequired) {
    if (!beforeRequired.has(name) && Object.prototype.hasOwnProperty.call(beforeProperties, name)) {
      changes.push(`${location}.${name}: property became required`);
    }
  }

  if (a.items && b.items) {
    schemaDifferences(spec, a.items, b.items, `${location}[]`, changes);
  }

  const stricterBounds = [
    ['minimum', (x, y) => y > x],
    ['minLength', (x, y) => y > x],
    ['minItems', (x, y) => y > x],
    ['maximum', (x, y) => y < x],
    ['maxLength', (x, y) => y < x],
    ['maxItems', (x, y) => y < x],
  ];
  for (const [key, isStricter] of stricterBounds) {
    if (typeof a[key] === 'number' && typeof b[key] === 'number' && isStricter(a[key], b[key])) {
      changes.push(`${location}: ${key} became stricter (${a[key]} -> ${b[key]})`);
    }
  }
  if (a.pattern && b.pattern && a.pattern !== b.pattern) {
    changes.push(`${location}: pattern changed`);
  }
}

function bodySchema(operation) {
  const content = operation.requestBody?.content?.['application/json'];
  return content ? content.schema : null;
}

function main() {
  if (!fs.existsSync(CURRENT_FILE) || !fs.existsSync(BASELINE_FILE)) {
    console.error('Both openapi.json and contract-baseline.json are required.');
    process.exit(1);
  }

  const current = readJson(CURRENT_FILE);
  const baseline = readJson(BASELINE_FILE);
  const changes = [];

  if (current.openapi !== baseline.openapi) {
    changes.push(`OpenAPI version changed from ${baseline.openapi} to ${current.openapi}`);
  }

  const baselineServers = new Set((baseline.servers || []).map((server) => server.url));
  for (const url of baselineServers) {
    if (!(current.servers || []).some((server) => server.url === url)) {
      changes.push(`Server URL removed: ${url}`);
    }
  }

  const baselineVersions = new Set(baseline['x-api-versioning']?.supported || []);
  const currentVersions = new Set(current['x-api-versioning']?.supported || []);
  for (const version of baselineVersions) {
    if (!currentVersions.has(version)) changes.push(`Supported API version removed: ${version}`);
  }

  const baselineOperations = [];
  for (const [routePath, pathItem] of Object.entries(baseline.paths || {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (METHODS.has(method)) baselineOperations.push({ routePath, method, operation });
    }
  }

  for (const { routePath, method, operation: before } of baselineOperations) {
    const after = current.paths?.[routePath]?.[method];
    const key = `${method.toUpperCase()} ${routePath}`;
    if (!after) {
      changes.push(`${key}: operation removed`);
      continue;
    }

    if (before.operationId !== after.operationId) {
      changes.push(`${key}: operationId changed (${before.operationId} -> ${after.operationId})`);
    }

    const beforeAuth = before['x-authorization'];
    const afterAuth = after['x-authorization'];
    const beforeMode = beforeAuth?.mode || 'authenticated';
    const afterMode = afterAuth?.mode || 'authenticated';
    if (beforeMode !== afterMode) {
      changes.push(`${key}: authentication mode changed (${beforeMode} -> ${afterMode})`);
    }
    for (const field of ['permissions', 'anyPermissions']) {
      const a = JSON.stringify(beforeAuth?.[field] || []);
      const b = JSON.stringify(afterAuth?.[field] || []);
      if (a !== b) changes.push(`${key}: authorization ${field} changed`);
    }
    if (Boolean(beforeAuth?.organizationScope) !== Boolean(afterAuth?.organizationScope)) {
      changes.push(`${key}: organization scope requirement changed`);
    }

    for (const location of ['path', 'query']) {
      const beforeParams = parameterMap(before, location);
      const afterParams = parameterMap(after, location);
      for (const [name] of beforeParams) {
        if (!afterParams.has(name)) changes.push(`${key}: ${location} parameter '${name}' removed`);
      }
      for (const [name, parameter] of afterParams) {
        if (parameter.required && !beforeParams.has(name)) {
          changes.push(`${key}: required ${location} parameter '${name}' added`);
        }
      }
    }

    const beforeBody = bodySchema(before);
    const afterBody = bodySchema(after);
    if (beforeBody && !afterBody) {
      changes.push(`${key}: request body removed`);
    } else if (!beforeBody && afterBody && after.requestBody?.required) {
      changes.push(`${key}: required request body added`);
    } else if (beforeBody && afterBody) {
      schemaDifferences(current, beforeBody, afterBody, `${key} request`, changes);
    }

    const beforeStatuses = successStatuses(before);
    const afterStatuses = successStatuses(after);
    for (const status of beforeStatuses) {
      if (!afterStatuses.has(status)) changes.push(`${key}: success response ${status} removed`);
    }
  }

  if (changes.length > 0) {
    console.error(`Breaking API contract changes detected (${changes.length}):`);
    for (const change of changes) console.error(`  - ${change}`);
    console.error('If the change is intentional, run `npm run contracts:baseline` and review it.');
    process.exitCode = 1;
    return;
  }

  console.log(
    `No breaking API contract changes detected: ${baselineOperations.length} operations compared.`,
  );
}

main();
