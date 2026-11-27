import { AuthAside, AuthShell } from '@/components/auth/auth-shell';
import { AuthGate, OnboardingForm } from '@/components/auth/auth-forms';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'onboarding', '/onboarding');
}

export default function OnboardingPage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);
  const content = dictionary.pages.onboarding;

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
            { label: dictionary.auth.onboarding.sessionsLink, href: '/account/sessions' },
            { label: dictionary.auth.login.forgotLink, href: '/forgot-password' },
          ]}
        />
      }
    >
      <AuthGate locale={locale} dictionary={dictionary}>
        <OnboardingForm locale={locale} dictionary={dictionary} />
      </AuthGate>
    </AuthShell>
  );
}
