import { AuthGate } from '@/components/auth/auth-forms';
import { RoleDashboard } from '@/components/dashboard/role-dashboard';
import { getDashboardConfigBySlug } from '@/lib/dashboards/roles';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(
    params.locale,
    'qualityInspectorsDashboard',
    '/quality-inspectors/dashboard',
  );
}

export default async function QualityInspectorDashboardPage({ params }) {
  const { locale } = await params;
  const dictionary = requireDictionary(locale);

  return (
    <AuthGate locale={locale} dictionary={dictionary}>
      <RoleDashboard
        locale={locale}
        dictionary={dictionary}
        page={dictionary.pages.qualityInspectorsDashboard}
        config={getDashboardConfigBySlug('quality-inspectors')}
      />
    </AuthGate>
  );
}
