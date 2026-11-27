import { AuthGate } from '@/components/auth/auth-forms';
import { CartView } from '@/components/marketplace/cart-view';
import { MarketplaceFrame } from '@/components/marketplace/marketplace-frame';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'marketplaceCart', '/marketplace/cart');
}

export default function MarketplaceCartPage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);

  return (
    <AuthGate locale={locale} dictionary={dictionary}>
      <MarketplaceFrame
        locale={locale}
        dictionary={dictionary.marketplaceUi}
        page={dictionary.pages.marketplaceCart}
        active="cart"
      >
        <CartView locale={locale} dictionary={dictionary.marketplaceUi} />
      </MarketplaceFrame>
    </AuthGate>
  );
}
