import { getWebEnv } from './env';
import { getDictionary, localizedPath } from './i18n';

const { NEXT_PUBLIC_SITE_URL } = getWebEnv();

export const metadataBase = new URL(NEXT_PUBLIC_SITE_URL);

const ogLocales = { en: 'en_US', bn: 'bn_BD' };

export function createLocalizedPageMetadata(locale, pageKey, path) {
  const dictionary = getDictionary(locale);
  const page = dictionary?.pages?.[pageKey];

  if (!page) return {};

  return createPageMetadata({
    locale,
    title: `${page.title} | CROPSY`,
    description: page.lead,
    path,
  });
}

export function createPageMetadata({ locale, title, description, path = '/' }) {
  const canonical = localizedPath(locale, path);

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        en: localizedPath('en', path),
        bn: localizedPath('bn', path),
        'x-default': localizedPath('en', path),
      },
    },
    openGraph: {
      type: 'website',
      siteName: 'CROPSY',
      locale: ogLocales[locale] ?? ogLocales.en,
      url: canonical,
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}
