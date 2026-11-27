import Link from 'next/link';
import { localizedPath } from '@/lib/i18n';
import { ArrowRightIcon, buttonStyles } from '../ui';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

function ActionLink({ action, locale, variant = 'primary' }) {
  if (!action?.href) return null;
  const href = action.href.startsWith('/design-system')
    ? action.href
    : localizedPath(locale, action.href);

  return (
    <Link href={href} className={buttonStyles({ variant })}>
      {action.label}
      <ArrowRightIcon className="h-4 w-4" />
    </Link>
  );
}

function SectionBlock({ section }) {
  return (
    <Card className="h-full">
      <CardHeader className="border-none pb-2">
        <CardTitle>{section.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        {section.body ? <p className="text-body-sm text-content-muted">{section.body}</p> : null}
        {section.paragraphs?.length ? (
          <div className="flex flex-col gap-3">
            {section.paragraphs.map((paragraph, index) => (
              <p key={index} className="text-body-sm text-content-muted">
                {paragraph}
              </p>
            ))}
          </div>
        ) : null}
        {section.bullets?.length ? (
          <ul className="flex flex-col gap-2">
            {section.bullets.map((bullet, index) => (
              <li key={index} className="flex items-start gap-2 text-body-sm text-content-muted">
                <span
                  aria-hidden="true"
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-pill bg-brand-600"
                />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function PageHero({ content, actions }) {
  return (
    <header className="flex max-w-4xl flex-col gap-5">
      {content.eyebrow ? (
        <p className="text-overline font-semibold uppercase text-brand-700 dark:text-brand-300">
          {content.eyebrow}
        </p>
      ) : null}
      <h1 className="text-display font-bold">{content.title}</h1>
      {content.lead ? (
        <p className="max-w-3xl text-body-lg text-content-muted">{content.lead}</p>
      ) : null}
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </header>
  );
}

export function SectionGrid({ sections = [] }) {
  if (sections.length === 0) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sections.map((section, index) => (
        <SectionBlock key={section.title ?? index} section={section} />
      ))}
    </div>
  );
}

export function CtaBand({ content, locale }) {
  if (!content?.href) return null;
  return (
    <section className="flex flex-col gap-4 rounded-panel border border-brand-200 bg-brand-50 p-card dark:border-brand-800 dark:bg-brand-950/40 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <h2 className="text-subheading font-semibold text-content">
          {content.label ?? content.title}
        </h2>
        {content.description ? (
          <p className="text-body-sm text-content-muted">{content.description}</p>
        ) : null}
      </div>
      <ActionLink action={content} locale={locale} variant="secondary" />
    </section>
  );
}

export function ActionCards({ title, lead, actions = [], locale }) {
  if (actions.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-heading font-semibold">{title}</h2>
        {lead ? <p className="max-w-3xl text-body-sm text-content-muted">{lead}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={localizedPath(locale, action.href)}
            className={buttonStyles({
              variant: 'secondary',
              className: 'h-auto min-h-control justify-between gap-3 py-3 text-left',
            })}
          >
            <span>{action.label}</span>
            <ArrowRightIcon className="h-4 w-4 shrink-0" />
          </Link>
        ))}
      </div>
    </section>
  );
}

export function MarketingPage({ locale, content, children, showHeroActions = true }) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-section px-page py-section">
      <PageHero
        content={content}
        locale={locale}
        actions={
          showHeroActions ? (
            <>
              <ActionLink action={content.primary} locale={locale} />
              <ActionLink action={content.secondary} locale={locale} variant="secondary" />
            </>
          ) : null
        }
      />
      {children}
      <SectionGrid sections={content.sections} />
      <CtaBand content={content.cta} locale={locale} />
    </div>
  );
}
