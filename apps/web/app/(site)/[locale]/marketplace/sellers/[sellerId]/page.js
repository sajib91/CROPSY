import { AuthGate } from '@/components/auth/auth-forms';
import { MarketplaceFrame } from '@/components/marketplace/marketplace-frame';
import { SellerProfile } from '@/components/marketplace/seller-profile';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'marketplaceSeller', '/marketplace/sellers');
}

export default function MarketplaceSellerPage({ params }) {
  const { locale, sellerId } = params;
  const dictionary = requireDictionary(locale);

  return (
    <AuthGate locale={locale} dictionary={dictionary}>
      <MarketplaceFrame
        locale={locale}
        dictionary={dictionary.marketplaceUi}
        page={dictionary.pages.marketplaceSeller}
        active="search"
      >
        <SellerProfile locale={locale} sellerId={sellerId} dictionary={dictionary.marketplaceUi} />
      </MarketplaceFrame>
    </AuthGate>
  );
}
