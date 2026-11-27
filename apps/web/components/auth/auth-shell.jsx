import Link from 'next/link';
import { localizedPath } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '../ui';

export function AuthShell({ eyebrow, title, lead, children, aside }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-page py-section lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex flex-col gap-6">
        <header className="flex max-w-2xl flex-col gap-3">
          {eyebrow ? (
            <p className="text-overline font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-heading font-bold text-content">{title}</h1>
          {lead ? <p className="text-body-sm text-content-muted">{lead}</p> : null}
        </header>
        <Card>
          <CardHeader className="border-none pb-0">
            <CardTitle as="h2" className="sr-only">
              {title}
            </CardTitle>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
      {aside ? <aside className="flex flex-col gap-4">{aside}</aside> : null}
    </div>
  );
}

export function AuthAsideCard({ title, children }) {
  return (
    <section className="rounded-card border border-line bg-surface-muted p-card">
      <h2 className="text-body-sm font-semibold text-content">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-body-sm text-content-muted">{children}</div>
    </section>
  );
}

export function AuthAside({ locale, dictionary, links = [] }) {
  const common = dictionary.auth.common;
  return (
    <>
      <AuthAsideCard title={dictionary.footer.account}>
        <p>{common.secureNote}</p>
        <p>{common.apiNote}</p>
      </AuthAsideCard>
      {links.length ? (
        <AuthAsideCard title={dictionary.nav.account}>
          <ul className="flex flex-col gap-2">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={localizedPath(locale, link.href)}
                  className="rounded-xs text-body-sm font-semibold text-brand-700 hover:underline focus-ring dark:text-brand-300"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </AuthAsideCard>
      ) : null}
    </>
  );
}
