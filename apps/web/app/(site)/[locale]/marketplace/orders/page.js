import { AuthGate } from '@/components/auth/auth-forms';
import { MarketplaceFrame } from '@/components/marketplace/marketplace-frame';
import { OrderHistory } from '@/components/marketplace/order-history';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'marketplaceOrders', '/marketplace/orders');
}

export default function MarketplaceOrdersPage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);

  return (
    <AuthGate locale={locale} dictionary={dictionary}>
      <MarketplaceFrame
        locale={locale}
        dictionary={dictionary.marketplaceUi}
        page={dictionary.pages.marketplaceOrders}
        active="orders"
      >
        <OrderHistory locale={locale} dictionary={dictionary.marketplaceUi} />
      </MarketplaceFrame>
    </AuthGate>
  );
}
