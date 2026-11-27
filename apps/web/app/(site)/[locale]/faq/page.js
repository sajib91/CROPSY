import { MarketingPage } from '@/components/site/marketing-page';
import { ChevronDownIcon } from '@/components/ui';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'faq', '/faq');
}

export default function FaqPage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);
  const page = dictionary.pages.faq;

  return (
    <MarketingPage locale={locale} content={page} showHeroActions={false}>
      <div className="flex flex-col gap-3">
        {page.items.map((item, index) => (
          <details
            key={index}
            className="group rounded-card border border-line bg-surface p-4 focus-within:ring-2 focus-within:ring-focus"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xs text-body-sm font-semibold text-content focus-ring">
              <span>{item.q}</span>
              <ChevronDownIcon className="h-4 w-4 shrink-0 text-content-muted transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-3 text-body-sm text-content-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </MarketingPage>
  );
}
