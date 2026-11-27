import { bn } from './bn';
import { en } from './en';

export const locales = ['en', 'bn'];
export const defaultLocale = 'en';

const dictionaries = { en, bn };

export function isLocale(value) {
  return locales.includes(value);
}

export function getDictionary(locale) {
  return dictionaries[locale] ?? null;
}

export function localizedPath(locale, path = '') {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `/${locale}${normalized === '/' ? '' : normalized}`;
}

export function pathWithoutLocale(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return '/';
  if (isLocale(segments[0])) segments.shift();
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

export function localeFromPathname(pathname) {
  const segment = (pathname || '').split('/').filter(Boolean)[0];
  return isLocale(segment) ? segment : defaultLocale;
}
