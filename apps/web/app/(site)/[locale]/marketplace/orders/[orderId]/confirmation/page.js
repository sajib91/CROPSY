import { AuthGate } from '@/components/auth/auth-forms';
import { MarketplaceFrame } from '@/components/marketplace/marketplace-frame';
import { OrderConfirmation } from '@/components/marketplace/order-confirmation';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(
    params.locale,
    'marketplaceOrderConfirmation',
    '/marketplace/orders',
  );
}

export default function MarketplaceOrderConfirmationPage({ params }) {
  const { locale, orderId } = params;
  const dictionary = requireDictionary(locale);

  return (
    <AuthGate locale={locale} dictionary={dictionary}>
      <MarketplaceFrame
        locale={locale}
        dictionary={dictionary.marketplaceUi}
        page={dictionary.pages.marketplaceOrderConfirmation}
        active="orders"
      >
        <OrderConfirmation
          locale={locale}
          orderId={orderId}
          dictionary={dictionary.marketplaceUi}
        />
      </MarketplaceFrame>
    </AuthGate>
  );
}
