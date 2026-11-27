'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getDictionary, localeFromPathname, localizedPath } from '@/lib/i18n';
import { buttonStyles, EmptyState, ErrorState, LoadingState } from '../ui';

function usePageLocale() {
  const pathname = usePathname() || '/';
  const locale = localeFromPathname(pathname);
  return { locale, dictionary: getDictionary(locale) };
}

export function SiteLoading() {
  const { dictionary } = usePageLocale();

  return (
    <div className="mx-auto max-w-7xl px-page py-section" aria-busy="true">
      <LoadingState
        label={dictionary.states.loadingTitle}
        description={dictionary.states.loadingDescription}
      />
    </div>
  );
}

export function SiteError({ reset }) {
  const { dictionary } = usePageLocale();

  return (
    <div className="mx-auto max-w-7xl px-page py-section">
      <ErrorState
        title={dictionary.states.errorTitle}
        description={dictionary.states.errorDescription}
        retryLabel={dictionary.common.tryAgain}
        onRetry={() => reset()}
      />
    </div>
  );
}

export function SiteNotFound() {
  const { locale, dictionary } = usePageLocale();

  return (
    <div className="mx-auto max-w-7xl px-page py-section">
      <EmptyState
        title={dictionary.states.notFoundTitle}
        description={dictionary.states.notFoundDescription}
        actions={
          <Link href={localizedPath(locale, '/')} className={buttonStyles()}>
            {dictionary.common.backHome}
          </Link>
        }
      />
    </div>
  );
}
