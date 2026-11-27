import { AuthGate } from '@/components/auth/auth-forms';
import { MarketplaceFrame } from '@/components/marketplace/marketplace-frame';
import { SellerListings } from '@/components/marketplace/seller-listings';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(
    params.locale,
    'marketplaceSellerListings',
    '/marketplace/seller/listings',
  );
}

export default function MarketplaceSellerListingsPage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);

  return (
    <AuthGate locale={locale} dictionary={dictionary}>
      <MarketplaceFrame
        locale={locale}
        dictionary={dictionary.marketplaceUi}
        page={dictionary.pages.marketplaceSellerListings}
        active="manage"
      >
        <SellerListings locale={locale} dictionary={dictionary.marketplaceUi} />
      </MarketplaceFrame>
    </AuthGate>
  );
}
