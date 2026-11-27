import '../../globals.css';
import { AuthProvider } from '@/components/auth/auth-provider';
import { RootShell } from '@/components/site/root-shell';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { requireDictionary } from '@/lib/i18n/server';
import { metadataBase } from '@/lib/seo';

export const metadata = {
  metadataBase,
  applicationName: 'CROPSY',
};

export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'bn' }];
}

export default function LocaleLayout({ children, params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);

  return (
    <AuthProvider locale={locale}>
      <RootShell locale={locale} skipLabel={dictionary.skip}>
        <div className="flex min-h-screen flex-col">
          <SiteHeader locale={locale} dictionary={dictionary} />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <SiteFooter locale={locale} dictionary={dictionary} />
        </div>
      </RootShell>
    </AuthProvider>
  );
}
