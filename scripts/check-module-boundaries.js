#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { modules } = require('../apps/api/src/modules/registry');

const root = path.resolve(__dirname, '..');
const apiSrc = path.join(root, 'apps/api/src');
const modulesRoot = path.join(apiSrc, 'modules');
const sharedRoot = path.join(apiSrc, 'shared');
const docsFile = path.join(root, 'docs/architecture/modules.md');

const allowedLayerImports = {
  domain: new Set(['domain']),
  application: new Set(['domain', 'application']),
  infrastructure: new Set(['domain', 'application', 'infrastructure']),
  presentation: new Set(['domain', 'application', 'presentation']),
  composition: new Set(['domain', 'application', 'infrastructure', 'presentation', 'composition']),
};

const allowedPackages = new Set([
  '@cropsy/api-contracts',
  '@cropsy/config',
  '@cropsy/shared',
  '@cropsy/validation',
  'fastify',
]);

const errors = [];

function addError(message) {
  errors.push(message);
}

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..');
}

function collectFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath));
    } else if (entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }
  return files;
}

function extractSpecifiers(source) {
  const patterns = [
    /(?:^|[^\w])import\s+[^'";\n]*?\s+from\s+['"]([^'"]+)['"]/g,
    /(?:^|[^\w])import\s*['"]([^'"]+)['"]/g,
    /(?:^|[^\w])require\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  const specifiers = new Set();

  for (const pattern of patterns) {
    let match = pattern.exec(source);
    while (match) {
      specifiers.add(match[1]);
      match = pattern.exec(source);
    }
  }

  return [...specifiers];
}

function resolveSpecifier(specifier, sourceFile) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(sourceFile), specifier);
  const candidates = [base, `${base}.js`, path.join(base, 'index.js')];
  return (
    candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ||
    base
  );
}

function layerOf(file, moduleKey) {
  const relative = path.relative(path.join(modulesRoot, moduleKey), file);
  if (relative === 'index.js') return 'composition';
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return 'outside';
  return relative.split(path.sep)[0];
}

const moduleIds = modules.map((module) => module.id);
const modulePaths = modules.map((module) => module.path);

if (modules.length !== 20) {
  addError(`Expected 20 module definitions, found ${modules.length}.`);
}

if (new Set(moduleIds).size !== moduleIds.length) {
  addError('Module ids must be unique.');
}

if (new Set(modulePaths).size !== modulePaths.length) {
  addError('Module URL paths must be unique.');
}

const knownIds = new Set(moduleIds);

for (const module of modules) {
  const id = module.id;

  for (const dependency of module.dependsOn) {
    if (dependency === id) {
      addError(`${id} must not declare a dependency on itself.`);
    }
    if (!knownIds.has(dependency)) {
      addError(`${id} depends on unknown module '${dependency}'.`);
    }
  }

  for (const topic of module.publishes) {
    if (!topic.startsWith(`${id}.`)) {
      addError(`${id} publishes topic '${topic}' outside its namespace.`);
    }
  }

  for (const topic of module.subscribes) {
    if (topic !== '*' && !moduleIds.some((candidate) => topic.startsWith(`${candidate}.`))) {
      addError(`${id} subscribes to unknown topic '${topic}'.`);
    }
  }

  const moduleDir = path.join(modulesRoot, id);
  if (!fs.existsSync(moduleDir) || !fs.statSync(moduleDir).isDirectory()) {
    addError(`Missing module directory for '${id}'.`);
    continue;
  }

  const requiredFiles = [
    'domain/index.js',
    `domain/${id}.entity.js`,
    `domain/${id}.repository.js`,
    'application/index.js',
    `application/${id}.dto.js`,
    `application/${id}.service.js`,
    'infrastructure/index.js',
    `infrastructure/${id}.repository.js`,
    'presentation/index.js',
    `presentation/${id}.routes.js`,
    'index.js',
  ];

  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(moduleDir, file))) {
      addError(`${id} is missing required layer file '${file}'.`);
    }
  }
}

for (const entry of fs.readdirSync(modulesRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name !== 'registry.js' && !knownIds.has(entry.name)) {
    addError(`Unexpected module directory '${entry.name}' is not in the registry.`);
  }
}

let checkedImports = 0;

for (const module of modules) {
  const moduleDir = path.join(modulesRoot, module.id);
  for (const file of collectFiles(moduleDir)) {
    const sourceLayer = layerOf(file, module.id);
    const source = fs.readFileSync(file, 'utf8');
    const display = path.relative(root, file);

    for (const specifier of extractSpecifiers(source)) {
      checkedImports += 1;

      if (specifier.startsWith('node:') || allowedPackages.has(specifier)) {
        continue;
      }

      if (!specifier.startsWith('.')) {
        addError(`${display} imports unapproved package '${specifier}'.`);
        continue;
      }

      const resolved = resolveSpecifier(specifier, file);

      if (isInside(sharedRoot, resolved)) {
        continue;
      }

      if (!isInside(modulesRoot, resolved)) {
        addError(`${display} imports outside the module and shared kernel: '${specifier}'.`);
        continue;
      }

      const targetModule = path.relative(modulesRoot, resolved).split(path.sep)[0];
      if (targetModule !== module.id) {
        addError(`${display} imports another module ('${targetModule}') directly: '${specifier}'.`);
        continue;
      }

      const targetLayer = layerOf(resolved, module.id);
      const allowed = allowedLayerImports[sourceLayer] || new Set();
      if (!allowed.has(targetLayer)) {
        addError(`${display} (${sourceLayer}) cannot import ${targetLayer} layer: '${specifier}'.`);
      }
    }
  }
}

if (!fs.existsSync(docsFile)) {
  addError('Missing docs/architecture/modules.md dependency documentation.');
} else {
  const docs = fs.readFileSync(docsFile, 'utf8');
  for (const id of moduleIds) {
    if (!docs.includes(`\`${id}\``)) {
      addError(`docs/architecture/modules.md does not document module '${id}'.`);
    }
  }
}

if (errors.length > 0) {
  console.error(`Module boundary check failed with ${errors.length} error(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Boundaries OK: ${modules.length} modules, ${checkedImports} imports checked, no cross-module imports.`,
);
