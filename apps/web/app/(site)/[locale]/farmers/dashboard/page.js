import { AuthGate } from '@/components/auth/auth-forms';
import { FarmerDashboard } from '@/components/dashboard/farmer-dashboard';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'farmersDashboard', '/farmers/dashboard');
}

export default async function FarmerDashboardPage({ params }) {
  const { locale } = await params;
  const dictionary = requireDictionary(locale);

  return (
    <AuthGate locale={locale} dictionary={dictionary}>
      <FarmerDashboard
        locale={locale}
        dictionary={dictionary.dashboard}
        page={dictionary.pages.farmersDashboard}
      />
    </AuthGate>
  );
}
