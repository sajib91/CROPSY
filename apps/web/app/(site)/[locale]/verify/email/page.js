import { AuthAside, AuthShell } from '@/components/auth/auth-shell';
import { VerificationForm } from '@/components/auth/auth-forms';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'verifyEmail', '/verify/email');
}

export default function VerifyEmailPage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);
  const content = dictionary.pages.verifyEmail;

  return (
    <AuthShell
      eyebrow={content.eyebrow}
      title={content.title}
      lead={content.lead}
      aside={<AuthAside locale={locale} dictionary={dictionary} />}
    >
      <VerificationForm locale={locale} dictionary={dictionary} channel="email" />
    </AuthShell>
  );
}
