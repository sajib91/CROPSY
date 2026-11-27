import { AuthGate } from '@/components/auth/auth-forms';
import { ListingDiscovery } from '@/components/marketplace/listing-discovery';
import { MarketplaceFrame } from '@/components/marketplace/marketplace-frame';
import { localizedPath } from '@/lib/i18n';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'marketplaceFilters', '/marketplace/filters');
}

export default function MarketplaceFiltersPage({ params, searchParams }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);

  return (
    <AuthGate locale={locale} dictionary={dictionary}>
      <MarketplaceFrame
        locale={locale}
        dictionary={dictionary.marketplaceUi}
        page={dictionary.pages.marketplaceFilters}
        active="filters"
      >
        <ListingDiscovery
          locale={locale}
          dictionary={dictionary.marketplaceUi}
          path={localizedPath(locale, '/marketplace/filters')}
          initialFilters={searchParams}
          expanded
          title={dictionary.pages.marketplaceFilters.title}
          lead={dictionary.pages.marketplaceFilters.lead}
        />
      </MarketplaceFrame>
    </AuthGate>
  );
}
