import { AuthGate } from '@/components/auth/auth-forms';
import { RoleDashboard } from '@/components/dashboard/role-dashboard';
import { getDashboardConfigBySlug } from '@/lib/dashboards/roles';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(
    params.locale,
    'inputSuppliersDashboard',
    '/agricultural-input-suppliers/dashboard',
  );
}

export default async function InputSupplierDashboardPage({ params }) {
  const { locale } = await params;
  const dictionary = requireDictionary(locale);

  return (
    <AuthGate locale={locale} dictionary={dictionary}>
      <RoleDashboard
        locale={locale}
        dictionary={dictionary}
        page={dictionary.pages.inputSuppliersDashboard}
        config={getDashboardConfigBySlug('agricultural-input-suppliers')}
      />
    </AuthGate>
  );
}
