import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const FILES = [
  { name: 'en', file: 'apps/web/lib/i18n/en.js' },
  { name: 'bn', file: 'apps/web/lib/i18n/bn.js' },
];

async function loadDictionary({ name, file }) {
  const source = await readFile(path.join(ROOT, file), 'utf8');
  const pattern = new RegExp(`^export\\s+const\\s+${name}\\s*=`, 'm');
  if (!pattern.test(source)) {
    throw new Error(`${file} does not export const ${name}.`);
  }
  const moduleSource = source.replace(pattern, `const ${name} =`) + `\nexport default ${name};`;
  const url = `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`;
  const module = await import(url);
  return module.default;
}

function leafKeys(value, prefix = '') {
  if (Array.isArray(value)) return [prefix];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) =>
      leafKeys(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

const [en, bn] = await Promise.all(FILES.map(loadDictionary));
const enKeys = new Set(leafKeys(en));
const bnKeys = new Set(leafKeys(bn));
const onlyEn = [...enKeys].filter((key) => !bnKeys.has(key)).sort();
const onlyBn = [...bnKeys].filter((key) => !enKeys.has(key)).sort();

console.log(
  `i18n leaf keys: en ${enKeys.size} bn ${bnKeys.size} onlyEn ${onlyEn.length} onlyBn ${onlyBn.length}`,
);

if (onlyEn.length > 0 || onlyBn.length > 0) {
  if (onlyEn.length > 0) console.error(`Only in en:\n${onlyEn.join('\n')}`);
  if (onlyBn.length > 0) console.error(`Only in bn:\n${onlyBn.join('\n')}`);
  process.exit(1);
}
