export function localizedText(item, field, locale) {
  if (!item || typeof item !== 'object') return '';
  const localized = locale === 'bn' ? item[`${field}Bn`] : item[field];
  if (typeof localized === 'string' && localized.trim()) return localized;
  if (typeof item[field] === 'string' && item[field].trim()) return item[field];
  return item[field] ?? '';
}

export function formatNumber(value, locale = 'en') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-US').format(numeric);
}

export function formatDecimal(value, locale = 'en', maximumFractionDigits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    maximumFractionDigits,
  }).format(numeric);
}

export function formatMoney(value, currency, locale = 'en') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  if (!currency) return formatDecimal(numeric, locale);
  try {
    return new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${formatDecimal(numeric, locale)} ${currency}`;
  }
}

export function formatMoneyByCurrency(rows, field, locale = 'en') {
  const groups = new Map();
  for (const row of rows || []) {
    const currency = row?.currency || '';
    const numeric = Number(row?.[field]);
    if (!Number.isFinite(numeric)) continue;
    groups.set(currency, (groups.get(currency) || 0) + numeric);
  }
  return Array.from(groups, ([currency, total]) => ({
    currency,
    total,
    label: formatMoney(total, currency, locale),
  }));
}

export function formatDate(value, locale = 'en') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    dateStyle: 'medium',
  }).format(date);
}

export function formatDateTime(value, locale = 'en') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function sumNumbers(rows, selector) {
  return (rows || []).reduce((total, row) => {
    const value = Number(selector(row));
    return Number.isFinite(value) ? total + value : total;
  }, 0);
}

export function countRows(rows, predicate) {
  return (rows || []).filter((row) => (predicate ? predicate(row) : true)).length;
}

export function groupByLabel(rows, labelSelector, valueSelector) {
  const groups = new Map();
  for (const row of rows || []) {
    const label = String(labelSelector(row) || '—');
    const value = Number(valueSelector(row));
    if (!Number.isFinite(value)) continue;
    groups.set(label, (groups.get(label) || 0) + value);
  }
  return Array.from(groups, ([label, value]) => ({ label, value }));
}

export function uniqueOptions(rows, selector) {
  const values = new Set();
  for (const row of rows || []) {
    const value = selector(row);
    if (value !== undefined && value !== null && String(value).trim()) {
      values.add(String(value));
    }
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

export function filterRows(rows, filters) {
  return (rows || []).filter((row) => filters.every((predicate) => predicate(row)));
}

export function displayObject(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(displayObject).join(', ');
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}
