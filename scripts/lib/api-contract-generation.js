'use strict';

const fs = require('node:fs');
const path = require('node:path');

const buildServer = require('../../apps/api/src/app');
const { isPublicRoutePath } = require('../../apps/api/src/shared/http/authorization');
const { isZodSchema, zodToOpenApiSchema } = require('./zod-to-openapi');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const MODULES_DIR = path.join(ROOT_DIR, 'apps/api/src/modules');
const API_PREFIX = '/api/v1';
const METHODS = Object.freeze(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function pascal(value) {
  const parts = String(value)
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.map((part) => part[0].toUpperCase() + part.slice(1)).join('') || 'Root';
}

function routeToOpenApiPath(routeUrl) {
  const relative =
    routeUrl === API_PREFIX
      ? '/'
      : routeUrl.startsWith(`${API_PREFIX}/`)
        ? routeUrl.slice(API_PREFIX.length)
        : routeUrl;
  return relative.replace(/:([A-Za-z_][\w]*)/g, '{$1}');
}

function operationIdFor(method, openApiPath) {
  const segments = openApiPath
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith('{') && segment.endsWith('}')) {
        return `By${pascal(segment.slice(1, -1))}`;
      }
      return pascal(segment);
    });
  const suffix = segments.join('') || 'Root';
  return `${method.toLowerCase()}${suffix}`;
}

function moduleFromRoute(route) {
  const prefix = route.prefix || '';
  if (!prefix.startsWith(`${API_PREFIX}/`)) return 'platform';
  return prefix.slice(API_PREFIX.length + 1).split('/')[0];
}

async function collectRoutes() {
  const captured = [];
  const app = await buildServer({
    env: {
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      NOTIFICATION_QUEUE_DRIVER: 'memory',
      NOTIFICATION_REALTIME_ENABLED: 'false',
      AUTH_OTP_PROVIDER_MODE: 'preview',
    },
    logger: false,
    onRoute(route) {
      if (!METHODS.includes(route.method)) return;
      if (route.url !== API_PREFIX && !route.url.startsWith(`${API_PREFIX}/`)) return;
      captured.push({
        method: route.method,
        routeUrl: route.url,
        path: routeToOpenApiPath(route.url),
        prefix: route.prefix || '',
        module: moduleFromRoute(route),
        config: route.config || {},
        handler: String(route.handler || ''),
      });
    },
  });

  try {
    await app.ready();
  } finally {
    await app.close();
  }

  const seen = new Set();
  return captured
    .filter((route) => {
      const key = `${route.method} ${route.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

function collectDtoSchemas() {
  const index = new Map();
  for (const moduleEntry of fs.readdirSync(MODULES_DIR, { withFileTypes: true })) {
    if (!moduleEntry.isDirectory()) continue;
    const applicationDir = path.join(MODULES_DIR, moduleEntry.name, 'application');
    if (!fs.existsSync(applicationDir)) continue;
    for (const file of fs.readdirSync(applicationDir)) {
      if (!file.endsWith('.dto.js')) continue;
      const exported = require(path.join(applicationDir, file));
      for (const [name, value] of Object.entries(exported)) {
        if (!isZodSchema(value)) continue;
        index.set(`${moduleEntry.name}:${name}`, { name, module: moduleEntry.name, schema: value });
      }
    }
  }
  return index;
}

function roleFromArgument(argument) {
  const value = String(argument || '');
  if (/(^|\.)params$/i.test(value) || /Params/i.test(value)) return 'params';
  if (/(^|\.)(query|filter|filters)$/i.test(value) || /Query/i.test(value)) return 'query';
  return 'body';
}

function roleFromName(name) {
  if (/ParamsSchema$/.test(name)) return 'params';
  if (/QuerySchema$/.test(name)) return 'query';
  return 'body';
}

function classifySchemaReference(name, context) {
  const direct = new RegExp(
    `validate\\s*\\(\\s*(?:dto\\.)?${name}\\s*,\\s*([A-Za-z_$][\\w$.]*)`,
  ).exec(context || '');
  if (direct) return roleFromArgument(direct[1]);
  return roleFromName(name);
}

function buildServiceSchemaIndex(dtoIndex) {
  const index = new Map();
  for (const moduleEntry of fs.readdirSync(MODULES_DIR, { withFileTypes: true })) {
    if (!moduleEntry.isDirectory()) continue;
    const applicationDir = path.join(MODULES_DIR, moduleEntry.name, 'application');
    if (!fs.existsSync(applicationDir)) continue;

    for (const file of fs.readdirSync(applicationDir)) {
      if (!file.endsWith('.service.js')) continue;
      const source = fs.readFileSync(path.join(applicationDir, file), 'utf8');
      const matches = [...source.matchAll(/^\s{2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm)];
      for (let indexInFile = 0; indexInFile < matches.length; indexInFile += 1) {
        const match = matches[indexInFile];
        const methodName = match[1];
        if (index.has(`${moduleEntry.name}:${methodName}`)) continue;
        const body = source.slice(match.index, matches[indexInFile + 1]?.index ?? source.length);
        const roles = { body: [], query: [], params: [] };
        for (const reference of body.matchAll(/\b([A-Za-z_$][\w$]*Schema)\b/g)) {
          const name = reference[1];
          if (!dtoIndex.has(`${moduleEntry.name}:${name}`)) continue;
          const role = classifySchemaReference(name, body);
          if (!roles[role].includes(name)) roles[role].push(name);
        }
        index.set(`${moduleEntry.name}:${methodName}`, roles);
      }
    }
  }
  return index;
}

function inferSchemas(route, dtoIndex, serviceIndex) {
  const found = { body: [], query: [], params: [] };
  const handler = route.handler;

  function add(name, role) {
    if (!dtoIndex.has(`${route.module}:${name}`)) return;
    if (!found[role].includes(name)) found[role].push(name);
  }

  for (const reference of handler.matchAll(/\b([A-Za-z_$][\w$]*Schema)\b/g)) {
    add(reference[1], classifySchemaReference(reference[1], handler));
  }

  for (const call of handler.matchAll(/\b[A-Za-z_$][\w$]*\.([A-Za-z_$][\w$]*)\s*\(/g)) {
    const methodName = call[1];
    const indexed = serviceIndex.get(`${route.module}:${methodName}`);
    if (!indexed) continue;
    for (const role of ['body', 'query', 'params']) {
      for (const name of indexed[role]) {
        if (found[role].length === 0 || role !== 'body') add(name, role);
      }
    }
  }

  return found;
}

function successStatus(handler) {
  const matches = [...handler.matchAll(/reply\.(?:code|status)\((\d{3})\)/g)];
  return matches.length > 0 ? Number(matches[matches.length - 1][1]) : 200;
}

function authMetadata(route) {
  const config = route.config.auth;
  const explicitlyPublic = config === false || config === 'public';
  const allowlistedPublic = isPublicRoutePath(route.routeUrl, API_PREFIX);
  const isPublic = explicitlyPublic || allowlistedPublic;
  const policy = config && typeof config === 'object' ? config : {};
  return {
    mode: isPublic ? 'public' : 'authenticated',
    permissions: Array.isArray(policy.permissions) ? [...policy.permissions] : [],
    anyPermissions: Array.isArray(policy.anyPermissions) ? [...policy.anyPermissions] : [],
    organizationScope: Boolean(policy.organizationScope),
    enforcement: explicitlyPublic
      ? 'route-config'
      : allowlistedPublic
        ? 'public-allowlist'
        : 'default-deny',
    csrfForCookieClients:
      (!SAFE_METHODS.has(route.method) && !isPublic) || route.path === '/iam/auth/logout',
  };
}

function errorResponses(authorization) {
  const codes = ['400', '401', '403', '404', '409', '422', '429', '500', '503'];
  const responses = {};
  for (const code of codes) {
    if (authorization.mode === 'public' && (code === '401' || code === '403')) continue;
    responses[code] = { $ref: `#/components/responses/Error${code}` };
  }
  return responses;
}

function queryParameters(querySchema) {
  if (!querySchema) return [];
  const converted = zodToOpenApiSchema(querySchema);
  if (converted.type !== 'object' || !converted.properties) return [];
  const required = new Set(converted.required || []);
  return Object.entries(converted.properties)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, schema]) => ({
      name,
      in: 'query',
      required: required.has(name),
      description: schema.description || `Filter or option '${name}'.`,
      schema: { ...schema },
    }));
}

function pathParameters(openApiPath, paramSchemas) {
  const names = [...openApiPath.matchAll(/\{([A-Za-z_][\w]*)\}/g)].map((match) => match[1]);
  const converted = paramSchemas.length > 0 ? zodToOpenApiSchema(paramSchemas[0]) : null;
  return names.map((name) => {
    const schema = converted?.properties?.[name] || { type: 'string' };
    return {
      name,
      in: 'path',
      required: true,
      description: `Path parameter '${name}'.`,
      schema: { ...schema },
    };
  });
}

function componentName(module, schemaName) {
  return `${pascal(module)}${pascal(schemaName.replace(/Schema$/, ''))}Request`;
}

function envelopeComponents() {
  return {
    JsonObjectRequest: {
      type: 'object',
      additionalProperties: true,
      description: 'Operation-specific JSON request body. Backend DTOs enforce required fields.',
    },
    SuccessEnvelope: {
      type: 'object',
      required: ['success', 'data'],
      additionalProperties: true,
      properties: {
        success: { const: true },
        data: {
          description: 'Backend-owned domain payload. Shape is defined by the owning module.',
        },
        meta: {
          type: 'object',
          additionalProperties: true,
          properties: {
            requestId: { type: ['string', 'null'] },
            apiVersion: { type: 'string' },
            count: { type: 'integer' },
          },
        },
      },
    },
    ErrorEnvelope: {
      type: 'object',
      required: ['success', 'error'],
      additionalProperties: true,
      properties: {
        success: { const: false },
        error: {
          oneOf: [
            { type: 'string' },
            {
              type: 'object',
              required: ['code'],
              additionalProperties: true,
              properties: { code: { type: 'string' }, message: { type: 'string' } },
            },
          ],
        },
        meta: {
          type: 'object',
          additionalProperties: true,
          properties: {
            message: { type: 'string' },
            details: {},
            requestId: { type: ['string', 'null'] },
            method: { type: 'string' },
            path: { type: 'string' },
          },
        },
      },
    },
    VersionInfo: {
      type: 'object',
      additionalProperties: true,
      properties: {
        version: { type: 'string' },
        prefix: { type: 'string' },
        supportedVersions: { type: 'array', items: { type: 'string' } },
      },
    },
  };
}

function responseComponents() {
  const descriptions = {
    Error400: 'The request body, query, or path parameters failed validation.',
    Error401: 'Authentication is required or the supplied token/session is invalid.',
    Error403: 'The authenticated principal lacks the required permission or scope.',
    Error404: 'The requested route or resource does not exist.',
    Error409: 'The request conflicts with current server state.',
    Error422: 'The request is semantically invalid.',
    Error429: 'The rate limit was exceeded.',
    Error500: 'An unexpected server error occurred.',
    Error503: 'A required upstream dependency is unavailable.',
  };
  const result = {};
  for (const [name, description] of Object.entries(descriptions)) {
    result[name] = {
      description,
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
      },
    };
  }
  return result;
}

function paginationMetadata(convertedQuery) {
  if (!convertedQuery?.properties?.limit && !convertedQuery?.properties?.offset) return null;
  return {
    style: 'offset',
    parameters: ['limit', 'offset'].filter((name) => convertedQuery.properties[name]),
    defaults: Object.fromEntries(
      ['limit', 'offset']
        .filter((name) => typeof convertedQuery.properties?.[name]?.default === 'number')
        .map((name) => [name, convertedQuery.properties[name].default]),
    ),
    limits: Object.fromEntries(
      ['limit', 'offset']
        .filter((name) => convertedQuery.properties?.[name])
        .map((name) => {
          const schema = convertedQuery.properties[name];
          const bounds = {};
          if (typeof schema.minimum === 'number') bounds.minimum = schema.minimum;
          if (typeof schema.maximum === 'number') bounds.maximum = schema.maximum;
          return [name, bounds];
        }),
    ),
  };
}

function buildOperation(route, dtoIndex, serviceIndex, generatedSchemas) {
  const inferred = inferSchemas(route, dtoIndex, serviceIndex);
  const authorization = authMetadata(route);
  const status = successStatus(route.handler);
  const operationId = operationIdFor(route.method, route.path);

  const pathSchemas = inferred.params
    .map((name) => dtoIndex.get(`${route.module}:${name}`)?.schema)
    .filter(Boolean);
  const querySchemas = inferred.query
    .map((name) => dtoIndex.get(`${route.module}:${name}`)?.schema)
    .filter(Boolean);
  const bodySchemas = inferred.body
    .map((name) => dtoIndex.get(`${route.module}:${name}`)?.schema)
    .filter(Boolean);

  const parameters = [
    { $ref: '#/components/parameters/ApiVersionHeader' },
    ...(authorization.mode === 'authenticated'
      ? [{ $ref: '#/components/parameters/OrganizationHeader' }]
      : []),
    ...pathParameters(route.path, pathSchemas),
    ...queryParameters(querySchemas[0]),
  ];

  let requestBody;
  if (BODY_METHODS.has(route.method)) {
    let schemaRef = '#/components/schemas/JsonObjectRequest';
    let requestContract = null;
    if (bodySchemas.length > 0) {
      const name = componentName(route.module, inferred.body[0]);
      if (!generatedSchemas.has(name)) {
        generatedSchemas.set(name, zodToOpenApiSchema(bodySchemas[0]));
      }
      schemaRef = `#/components/schemas/${name}`;
      requestContract = inferred.body[0];
    }
    requestBody = {
      required: Boolean(requestContract),
      content: { 'application/json': { schema: { $ref: schemaRef } } },
    };
  }

  const convertedQuery = querySchemas[0] ? zodToOpenApiSchema(querySchemas[0]) : null;
  const queryNames = parameters.filter((parameter) => parameter.in === 'query').map((p) => p.name);
  const pagination = paginationMetadata(convertedQuery);
  const sortSchema = convertedQuery?.properties?.sort;

  const operation = {
    operationId,
    tags: [pascal(route.module)],
    summary: `${route.method} ${route.path}`,
    description: `Registered by the ${route.module} module. Business rules, totals, and authorization are enforced by the backend.`,
    parameters,
    responses: {
      [String(status)]: {
        description: 'Successful response in the standard CROPSY envelope.',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } },
        },
      },
      ...errorResponses(authorization),
    },
    security: authorization.mode === 'public' ? [] : [{ bearerAuth: [] }, { cookieAuth: [] }],
    'x-authorization': authorization,
    'x-client-contract': {
      mobile: 'bearer token with client: mobile',
      web:
        authorization.mode === 'public'
          ? 'anonymous or cookie session'
          : 'cookie session with CSRF on mutations',
    },
    'x-request-contract': inferred.body[0] || null,
    'x-response-contract': 'SuccessEnvelope',
    'x-success-status': status,
    'x-pagination': pagination,
    'x-filtering': {
      parameters: queryNames.filter((name) => !['limit', 'offset', 'sort'].includes(name)),
    },
    'x-sorting': sortSchema
      ? { parameter: 'sort', value: sortSchema.enum || null, default: sortSchema.default ?? null }
      : null,
  };

  if (requestBody) operation.requestBody = requestBody;
  return operation;
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) result[key] = sortObject(value[key]);
    return result;
  }
  return value;
}

async function generateOpenApi() {
  const routes = await collectRoutes();
  const dtoIndex = collectDtoSchemas();
  const serviceIndex = buildServiceSchemaIndex(dtoIndex);
  const generatedSchemas = new Map();

  const paths = {};
  const operationIds = new Map();
  for (const route of routes) {
    const operation = buildOperation(route, dtoIndex, serviceIndex, generatedSchemas);
    if (operationIds.has(operation.operationId)) {
      throw new Error(`Duplicate OpenAPI operationId: ${operation.operationId}`);
    }
    operationIds.set(operation.operationId, `${route.method} ${route.path}`);
    if (!paths[route.path]) paths[route.path] = {};
    paths[route.path][route.method.toLowerCase()] = operation;
  }

  const tags = [...new Set(routes.map((route) => pascal(route.module)))].sort();
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'CROPSY Business API',
      version: '1.0.0',
      description:
        'Canonical OpenAPI 3.1 contract for the CROPSY backend. Backend-owned business rules are enforced by the API; clients consume generated operations from this document.',
    },
    servers: [{ url: API_PREFIX, description: 'Active CROPSY API version' }],
    tags: tags.map((name) => ({ name })),
    paths: sortObject(paths),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Required for mobile clients. Access tokens must be bearer tokens.',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'cropsy_access',
          description: 'Used by Next.js web clients. Mutations require X-CSRF-Token.',
        },
      },
      parameters: {
        ApiVersionHeader: {
          name: 'X-API-Version',
          in: 'header',
          required: false,
          schema: { type: 'string', enum: ['v1'] },
          description: 'Optional explicit API version selection; omitted means v1.',
        },
        OrganizationHeader: {
          name: 'X-Organization-Id',
          in: 'header',
          required: false,
          schema: { type: 'string', format: 'uuid' },
          description: 'Optional active organization context for scoped operations.',
        },
      },
      schemas: {
        ...envelopeComponents(),
        ...Object.fromEntries(
          [...generatedSchemas.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, schema]) => [name, sortObject(schema)]),
        ),
      },
      responses: sortObject(responseComponents()),
    },
    'x-api-versioning': {
      active: 'v1',
      supported: ['v1'],
      strategy: 'path-prefix-and-header',
      header: 'X-API-Version',
    },
    'x-client-contracts': {
      mobile: {
        transport: 'bearer',
        clientValue: 'mobile',
        header: 'Authorization',
        basePath: API_PREFIX,
      },
      web: {
        transport: 'cookie',
        csrfHeader: 'X-CSRF-Token',
        basePath: API_PREFIX,
      },
    },
    'x-contract-generation': {
      specVersion: '3.1.0',
      routeSource: 'Fastify route registry',
      requestSchemaSource: 'Zod DTOs enforced by application services',
      responseSchemaSource: 'standard envelope; domain payloads are owned by modules',
      operationCount: routes.length,
    },
  };

  return sortObject(spec);
}

function operationsFromSpec(spec) {
  const operations = [];
  for (const [routePath, pathItem] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!METHODS.includes(method.toUpperCase())) continue;
      operations.push({
        operationId: operation.operationId,
        method: method.toUpperCase(),
        path: routePath,
        absolutePath: `${API_PREFIX}${routePath === '/' ? '' : routePath}`,
        tags: [...(operation.tags || [])],
        authorization: operation['x-authorization'],
        pathParameters: (operation.parameters || [])
          .map((parameter) => (parameter.in === 'path' ? parameter.name : null))
          .filter(Boolean),
        queryParameters: (operation.parameters || [])
          .map((parameter) => (parameter.in === 'query' ? parameter.name : null))
          .filter(Boolean),
        requestBody: Boolean(operation.requestBody),
        requestContract: operation['x-request-contract'] || null,
        successStatus: Number(operation['x-success-status'] || 200),
        pagination: operation['x-pagination'] || null,
        sorting: operation['x-sorting'] || null,
      });
    }
  }
  return operations.sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
}

function typeScriptDeclarations(operations) {
  const ids = operations.map((operation) => `'${operation.operationId}'`).join(' | ');
  return `// Generated from packages/api-contracts/openapi.json. Do not edit.\nexport type ApiVersion = 'v1';\nexport type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';\nexport type OperationId = ${ids || 'never'};\n\nexport interface ContractOperation {\n  operationId: OperationId;\n  method: HttpMethod;\n  path: string;\n  absolutePath: string;\n  tags: readonly string[];\n  authorization: {\n    mode: 'public' | 'authenticated';\n    permissions: readonly string[];\n    anyPermissions: readonly string[];\n    organizationScope: boolean;\n  };\n  pathParameters: readonly string[];\n  queryParameters: readonly string[];\n  requestBody: boolean;\n  requestContract: string | null;\n  successStatus: number;\n}\n\nexport declare const operations: readonly ContractOperation[];\nexport declare function getOperation(idOrRef: OperationId | string): ContractOperation;\nexport declare function requireOperation(method: HttpMethod, path: string): ContractOperation;\nexport declare function contractPath(method: HttpMethod, path: string, params?: Record<string, string | number>): string;\nexport declare function contractPathForOperation(operationId: OperationId, params?: Record<string, string | number>): string;\n`;
}

module.exports = {
  API_PREFIX,
  collectRoutes,
  generateOpenApi,
  operationsFromSpec,
  typeScriptDeclarations,
};
