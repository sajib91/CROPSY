import { AuthGate } from '@/components/auth/auth-forms';
import { MarketplaceFrame } from '@/components/marketplace/marketplace-frame';
import { OrderTracking } from '@/components/marketplace/order-tracking';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(
    params.locale,
    'marketplaceOrderTracking',
    '/marketplace/orders',
  );
}

export default function MarketplaceOrderTrackingPage({ params }) {
  const { locale, orderId } = params;
  const dictionary = requireDictionary(locale);

  return (
    <AuthGate locale={locale} dictionary={dictionary}>
      <MarketplaceFrame
        locale={locale}
        dictionary={dictionary.marketplaceUi}
        page={dictionary.pages.marketplaceOrderTracking}
        active="orders"
      >
        <OrderTracking locale={locale} orderId={orderId} dictionary={dictionary.marketplaceUi} />
      </MarketplaceFrame>
    </AuthGate>
  );
}
