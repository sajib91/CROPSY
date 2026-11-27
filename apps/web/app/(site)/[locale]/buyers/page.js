import { Suspense } from 'react';
import { DataPanelFallback, ModuleDirectoryPanel } from '@/components/site/data-panels';
import { MarketingPage } from '@/components/site/marketing-page';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'buyers', '/buyers');
}

export default function BuyersPage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);

  return (
    <MarketingPage locale={locale} content={dictionary.pages.buyers}>
      <Suspense fallback={<DataPanelFallback label={dictionary.data.loading} />}>
        <ModuleDirectoryPanel
          dictionary={dictionary}
          filterIds={['buyers', 'marketplace', 'orders', 'traceability']}
        />
      </Suspense>
    </MarketingPage>
  );
}
