import { AuthGate } from '@/components/auth/auth-forms';
import { CheckoutView } from '@/components/marketplace/checkout-view';
import { MarketplaceFrame } from '@/components/marketplace/marketplace-frame';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'marketplaceCheckout', '/marketplace/checkout');
}

export default function MarketplaceCheckoutPage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);

  return (
    <AuthGate locale={locale} dictionary={dictionary}>
      <MarketplaceFrame
        locale={locale}
        dictionary={dictionary.marketplaceUi}
        page={dictionary.pages.marketplaceCheckout}
        active="cart"
      >
        <CheckoutView locale={locale} dictionary={dictionary.marketplaceUi} />
      </MarketplaceFrame>
    </AuthGate>
  );
}
