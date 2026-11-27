import { Suspense } from 'react';
import { DataPanelFallback, ModuleInfoCallout } from '@/components/site/data-panels';
import { MarketingPage } from '@/components/site/marketing-page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { getWebEnv } from '@/lib/env';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'pricing', '/pricing');
}

export default function PricingPage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);
  const page = dictionary.pages.pricing;
  const { NEXT_PUBLIC_SUPPORT_EMAIL } = getWebEnv();

  return (
    <MarketingPage locale={locale} content={page}>
      <Suspense fallback={<DataPanelFallback label={dictionary.data.loading} />}>
        <ModuleInfoCallout moduleId="billing" dictionary={dictionary} />
      </Suspense>

      <Card>
        <CardHeader className="border-none pb-2">
          <CardTitle>{dictionary.pages.contact.emailLabel}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-body-sm text-content-muted">
            {NEXT_PUBLIC_SUPPORT_EMAIL
              ? dictionary.pages.contact.configuredIntro
              : dictionary.pages.contact.notConfiguredIntro}
          </p>
          {NEXT_PUBLIC_SUPPORT_EMAIL ? (
            <a
              href={`mailto:${NEXT_PUBLIC_SUPPORT_EMAIL}`}
              className="break-all font-mono text-body-sm text-brand-700 underline focus-ring dark:text-brand-300"
            >
              {NEXT_PUBLIC_SUPPORT_EMAIL}
            </a>
          ) : null}
        </CardContent>
      </Card>
    </MarketingPage>
  );
}
