import { MarketingPage } from '@/components/site/marketing-page';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'terms', '/terms');
}

export default function TermsPage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);

  return <MarketingPage locale={locale} content={dictionary.pages.terms} showHeroActions={false} />;
}
