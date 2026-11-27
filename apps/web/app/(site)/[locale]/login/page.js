import { AuthAside, AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from '@/components/auth/auth-forms';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'login', '/login');
}

export default function LoginPage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);
  const content = dictionary.pages.login;

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
            { label: dictionary.auth.common.createAccount, href: '/register' },
            { label: dictionary.auth.login.forgotLink, href: '/forgot-password' },
          ]}
        />
      }
    >
      <LoginForm locale={locale} dictionary={dictionary} />
    </AuthShell>
  );
}
