import { AuthGate } from '@/components/auth/auth-forms';
import { RoleDashboard } from '@/components/dashboard/role-dashboard';
import { getDashboardConfigBySlug } from '@/lib/dashboards/roles';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(
    params.locale,
    'wholesalersDashboard',
    '/wholesalers/dashboard',
  );
}

export default async function WholesalerDashboardPage({ params }) {
  const { locale } = await params;
  const dictionary = requireDictionary(locale);

  return (
    <AuthGate locale={locale} dictionary={dictionary}>
      <RoleDashboard
        locale={locale}
        dictionary={dictionary}
        page={dictionary.pages.wholesalersDashboard}
        config={getDashboardConfigBySlug('wholesalers')}
      />
    </AuthGate>
  );
}
