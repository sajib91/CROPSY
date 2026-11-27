import { AuthAside, AuthShell } from '@/components/auth/auth-shell';
import { RegistrationForm } from '@/components/auth/auth-forms';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'register', '/register');
}

export default function RegisterPage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);
  const content = dictionary.pages.register;

  return (
    <AuthShell
      eyebrow={content.eyebrow}
      title={content.title}
      lead={content.lead}
      aside={
        <AuthAside
          locale={locale}
          dictionary={dictionary}
          links={[{ label: dictionary.auth.common.signIn, href: '/login' }]}
        />
      }
    >
      <RegistrationForm locale={locale} dictionary={dictionary} />
    </AuthShell>
  );
}
