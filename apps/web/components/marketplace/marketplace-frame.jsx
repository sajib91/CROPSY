import { PageHero } from '@/components/site/marketing-page';
import { MarketplaceNav } from './marketplace-nav';

export function MarketplaceFrame({ locale, dictionary, page, active, children }) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-section px-page py-section">
      <PageHero content={page} />
      <MarketplaceNav locale={locale} labels={dictionary.nav} active={active} />
      {children}
    </div>
  );
}
