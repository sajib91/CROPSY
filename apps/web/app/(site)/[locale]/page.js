import { Suspense } from 'react';
import {
  ApiStatusPanel,
  DataPanelFallback,
  ModuleDirectoryPanel,
} from '@/components/site/data-panels';
import { ActionCards, MarketingPage, SectionGrid } from '@/components/site/marketing-page';
import { TraceabilityLookup } from '@/components/site/traceability-lookup';
import { getWebEnv } from '@/lib/env';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'home', '/');
}

export default function HomePage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);
  const content = dictionary.pages.home;
  const { NEXT_PUBLIC_API_URL } = getWebEnv();

  return (
    <MarketingPage locale={locale} content={content}>
      <div className="grid gap-4 xl:grid-cols-2">
        <Suspense fallback={<DataPanelFallback label={dictionary.data.loading} />}>
          <ApiStatusPanel dictionary={dictionary} />
        </Suspense>
        <Suspense fallback={<DataPanelFallback label={dictionary.data.loading} />}>
          <ModuleDirectoryPanel dictionary={dictionary} limit={6} />
        </Suspense>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-heading font-semibold">{content.stepsTitle}</h2>
          <p className="max-w-3xl text-body-sm text-content-muted">{content.stepsLead}</p>
        </div>
        <SectionGrid sections={content.steps} />
      </section>

      <TraceabilityLookup dictionary={dictionary} apiUrl={NEXT_PUBLIC_API_URL} />

      <ActionCards
        title={content.ctaTitle}
        lead={content.ctaLead}
        actions={[content.roleFarmers, content.roleBuyers, content.roleBusinesses]}
        locale={locale}
      />
    </MarketingPage>
  );
}
