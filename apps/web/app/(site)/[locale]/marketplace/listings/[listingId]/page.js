import { AuthGate } from '@/components/auth/auth-forms';
import { ListingDetail } from '@/components/marketplace/listing-detail';
import { MarketplaceFrame } from '@/components/marketplace/marketplace-frame';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'marketplaceListing', '/marketplace/listings');
}

export default function MarketplaceListingPage({ params }) {
  const { locale, listingId } = params;
  const dictionary = requireDictionary(locale);

  return (
    <AuthGate locale={locale} dictionary={dictionary}>
      <MarketplaceFrame
        locale={locale}
        dictionary={dictionary.marketplaceUi}
        page={dictionary.pages.marketplaceListing}
        active="search"
      >
        <ListingDetail
          locale={locale}
          listingId={listingId}
          dictionary={dictionary.marketplaceUi}
        />
      </MarketplaceFrame>
    </AuthGate>
  );
}
