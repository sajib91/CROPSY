'use strict';

/**
 * Runtime adapter generated from the OpenAPI operation inventory.
 * It exists so web and mobile clients cannot hard-code a path that the API no
 * longer publishes; every path is resolved against packages/api-contracts/openapi.json.
 */

const inventory = require('./operations.json');

const operations = inventory.operations;
const byId = new Map(operations.map((operation) => [operation.operationId, operation]));
const byKey = new Map(
  operations.map((operation) => [`${operation.method} ${operation.path}`, operation]),
);

function normalizePath(value, method) {
  const raw = String(value || '');
  const pathname = raw.split(/[?#]/, 1)[0];
  if (/^\/api\/v\d+(?:\/|$)/.test(pathname) && !pathname.startsWith('/api/v1')) {
    throw new Error(`Unsupported API version in '${value}'.`);
  }
  let normalized = pathname.startsWith('/api/v1') ? pathname.slice('/api/v1'.length) : pathname;
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  normalized = normalized.replace(/:([A-Za-z_][\w]*)/g, '{$1}');
  if (normalized.length > 1) normalized = normalized.replace(/\/+$/, '');
  if (method && byKey.has(`${method.toUpperCase()} ${normalized}`)) return normalized;
  return normalized;
}

function concreteMatch(operation, path) {
  const pattern = operation.path
    .split(/(\{[A-Za-z_][\w]*\})/)
    .map((part) => {
      if (/^\{[A-Za-z_][\w]*\}$/.test(part)) return '([^/]+)';
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  const match = new RegExp(`^${pattern}$`).exec(path);
  if (!match) return null;
  const params = {};
  const names = [...operation.path.matchAll(/\{([A-Za-z_][\w]*)\}/g)].map((entry) => entry[1]);
  names.forEach((name, index) => {
    params[name] = match[index + 1];
  });
  return params;
}

function requireOperation(method, path) {
  const normalizedMethod = String(method || '').toUpperCase();
  const normalizedPath = normalizePath(path, normalizedMethod);
  const exact = byKey.get(`${normalizedMethod} ${normalizedPath}`);
  if (exact) return exact;

  for (const operation of operations) {
    if (operation.method !== normalizedMethod) continue;
    if (concreteMatch(operation, normalizedPath)) return operation;
  }

  throw new Error(`No OpenAPI operation for ${normalizedMethod} ${normalizedPath}.`);
}

function requireOperationByPath(path) {
  const normalizedPath = normalizePath(path);
  for (const operation of operations) {
    if (operation.path === normalizedPath || concreteMatch(operation, normalizedPath)) {
      return operation;
    }
  }
  throw new Error(`No OpenAPI operation for path ${normalizedPath}.`);
}

function substitute(operation, params) {
  const values = { ...(params || {}) };
  return operation.path.replace(/\{([A-Za-z_][\w]*)\}/g, (token, name) => {
    const value = values[name];
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing contract parameter '${name}' for ${operation.operationId}.`);
    }
    return encodeURIComponent(String(value));
  });
}

function contractPath(method, path, params) {
  const operation = requireOperation(method, path);
  const normalizedPath = normalizePath(path, String(method).toUpperCase());
  const extracted = concreteMatch(operation, normalizedPath) || {};
  return substitute(operation, { ...extracted, ...(params || {}) });
}

function contractPathForOperation(operationId, params) {
  const operation = byId.get(operationId);
  if (!operation) throw new Error(`Unknown OpenAPI operation '${operationId}'.`);
  return substitute(operation, params);
}

module.exports = {
  operations,
  operationIds: operations.map((operation) => operation.operationId),
  getOperation: (operationId) => byId.get(operationId) || null,
  requireOperation,
  requireOperationByPath,
  contractPath,
  contractPathForOperation,
};
