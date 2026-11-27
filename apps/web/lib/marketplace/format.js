const LOCALE_TAGS = { en: 'en-US', bn: 'bn-BD' };

export function intlLocale(locale) {
  return LOCALE_TAGS[locale] || LOCALE_TAGS.en;
}

export function formatMoney(value, currency, locale) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  if (!currency || typeof currency !== 'string') return String(amount);
  try {
    return new Intl.NumberFormat(intlLocale(locale), {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function formatNumber(value, locale) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 3 }).format(amount);
}

export function formatDate(value, locale) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(value, locale) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function statusTone(status) {
  const tones = {
    ACTIVE: 'success',
    CONFIRMED: 'success',
    DELIVERED: 'success',
    COMPLETED: 'success',
    RESERVED: 'info',
    PROCESSING: 'info',
    SHIPPED: 'info',
    PENDING: 'warning',
    PAYMENT_PENDING: 'warning',
    PAYMENT_FAILED: 'danger',
    DRAFT: 'neutral',
    INACTIVE: 'neutral',
    EXPIRED: 'neutral',
    CANCELLED: 'danger',
    REFUNDED: 'danger',
  };
  return tones[status] || 'neutral';
}

export function localizedText(locale, primary, secondary) {
  if (locale === 'bn') return secondary || primary || null;
  return primary || secondary || null;
}
