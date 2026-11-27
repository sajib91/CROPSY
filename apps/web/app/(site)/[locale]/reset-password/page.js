import { AuthAside, AuthShell } from '@/components/auth/auth-shell';
import { ResetPasswordForm } from '@/components/auth/auth-forms';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'resetPassword', '/reset-password');
}

export default function ResetPasswordPage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);
  const content = dictionary.pages.resetPassword;

  return (
    <AuthShell
      eyebrow={content.eyebrow}
      title={content.title}
      lead={content.lead}
      aside={
        <AuthAside
          locale={locale}
          dictionary={dictionary}
          links={[{ label: dictionary.auth.reset.requestLink, href: '/forgot-password' }]}
        />
      }
    >
      <ResetPasswordForm locale={locale} dictionary={dictionary} />
    </AuthShell>
  );
}
