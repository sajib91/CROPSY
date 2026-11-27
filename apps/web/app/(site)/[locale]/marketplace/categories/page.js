import { AuthGate } from '@/components/auth/auth-forms';
import { CategoryDirectory } from '@/components/marketplace/category-directory';
import { MarketplaceFrame } from '@/components/marketplace/marketplace-frame';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(
    params.locale,
    'marketplaceCategories',
    '/marketplace/categories',
  );
}

export default function MarketplaceCategoriesPage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);

  return (
    <AuthGate locale={locale} dictionary={dictionary}>
      <MarketplaceFrame
        locale={locale}
        dictionary={dictionary.marketplaceUi}
        page={dictionary.pages.marketplaceCategories}
        active="categories"
      >
        <CategoryDirectory locale={locale} dictionary={dictionary.marketplaceUi} />
      </MarketplaceFrame>
    </AuthGate>
  );
}
