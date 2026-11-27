import Link from 'next/link';
import { MarketingPage } from '@/components/site/marketing-page';
import {
  ArrowRightIcon,
  buttonStyles,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { getWebEnv } from '@/lib/env';
import { localizedPath } from '@/lib/i18n';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'contact', '/contact');
}

export default function ContactPage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);
  const page = dictionary.pages.contact;
  const { NEXT_PUBLIC_SUPPORT_EMAIL } = getWebEnv();

  return (
    <MarketingPage locale={locale} content={page} showHeroActions={false}>
      <Card>
        <CardHeader className="border-none pb-2">
          <CardTitle>{page.emailLabel}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-body-sm text-content-muted">
            {NEXT_PUBLIC_SUPPORT_EMAIL ? page.configuredIntro : page.notConfiguredIntro}
          </p>
          {NEXT_PUBLIC_SUPPORT_EMAIL ? (
            <a
              href={`mailto:${NEXT_PUBLIC_SUPPORT_EMAIL}`}
              className="break-all font-mono text-body-sm text-brand-700 underline focus-ring dark:text-brand-300"
            >
              {NEXT_PUBLIC_SUPPORT_EMAIL}
            </a>
          ) : null}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-4">
        <h2 className="text-heading font-semibold">{page.alternativesTitle}</h2>
        <ul className="grid gap-4 md:grid-cols-3">
          {page.alternatives.map((alternative) => (
            <li key={alternative.href}>
              <Link
                href={localizedPath(locale, alternative.href)}
                className={buttonStyles({
                  variant: 'outline',
                  className: 'h-auto min-h-control justify-start gap-3 py-3 text-left',
                })}
              >
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">{alternative.label}</span>
                  <span className="text-caption font-normal text-content-muted">
                    {alternative.description}
                  </span>
                </span>
                <ArrowRightIcon className="ml-auto h-4 w-4 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </MarketingPage>
  );
}
