import { AuthAside, AuthShell } from '@/components/auth/auth-shell';
import { AuthGate, SessionsPanel } from '@/components/auth/auth-forms';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'sessions', '/account/sessions');
}

export default function SessionsPage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);
  const content = dictionary.pages.sessions;

  return (
    <AuthShell
      eyebrow={content.eyebrow}
      title={content.title}
      lead={content.lead}
      aside={
        <AuthAside
          locale={locale}
          dictionary={dictionary}
          links={[
            { label: dictionary.auth.sessions.setupLink, href: '/onboarding' },
            { label: dictionary.auth.common.backToLogin, href: '/login' },
          ]}
        />
      }
    >
      <AuthGate locale={locale} dictionary={dictionary}>
        <SessionsPanel locale={locale} dictionary={dictionary} />
      </AuthGate>
    </AuthShell>
  );
}
