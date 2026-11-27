import { AuthAside, AuthShell } from '@/components/auth/auth-shell';
import { VerificationForm } from '@/components/auth/auth-forms';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'verifyPhone', '/verify/phone');
}

export default function VerifyPhonePage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);
  const content = dictionary.pages.verifyPhone;

  return (
    <AuthShell
      eyebrow={content.eyebrow}
      title={content.title}
      lead={content.lead}
      aside={<AuthAside locale={locale} dictionary={dictionary} />}
    >
      <VerificationForm locale={locale} dictionary={dictionary} channel="phone" />
    </AuthShell>
  );
}
