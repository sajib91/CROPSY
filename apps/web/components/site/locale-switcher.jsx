'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { locales, pathWithoutLocale } from '@/lib/i18n';
import { cn } from '../ui/cn';

const names = { en: 'EN', bn: 'বাংলা' };

export function LocaleSwitcher({ currentLocale, label }) {
  const pathname = usePathname() || '/';
  const path = pathWithoutLocale(pathname);

  return (
    <nav
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-control border border-line bg-surface p-1"
    >
      {locales.map((locale) => (
        <Link
          key={locale}
          href={`/${locale}${path === '/' ? '' : path}`}
          hrefLang={locale}
          aria-current={locale === currentLocale ? 'true' : undefined}
          className={cn(
            'rounded-xs px-2 py-1 text-caption font-semibold transition-colors focus-ring',
            locale === currentLocale
              ? 'bg-brand-700 text-white dark:bg-brand-500 dark:text-content-on-brand'
              : 'text-content-muted hover:bg-surface-muted hover:text-content',
          )}
        >
          {names[locale]}
        </Link>
      ))}
    </nav>
  );
}
