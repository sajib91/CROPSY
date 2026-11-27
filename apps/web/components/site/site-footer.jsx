import Link from 'next/link';
import { localizedPath } from '@/lib/i18n';
import { LeafIcon } from '../ui';

export function SiteFooter({ locale, dictionary }) {
  const path = (value) => localizedPath(locale, value);

  const columns = [
    {
      title: dictionary.footer.product,
      links: [
        { label: dictionary.nav.about, href: path('/about') },
        { label: dictionary.nav.how, href: path('/how-it-works') },
        { label: dictionary.nav.farmers, href: path('/farmers') },
        { label: dictionary.nav.buyers, href: path('/buyers') },
        { label: dictionary.nav.businesses, href: path('/businesses') },
      ],
    },
    {
      title: dictionary.footer.resources,
      links: [
        { label: dictionary.nav.marketplace, href: path('/marketplace') },
        { label: dictionary.nav.intelligence, href: path('/agricultural-intelligence') },
        { label: dictionary.nav.pricing, href: path('/pricing') },
        { label: dictionary.nav.contact, href: path('/contact') },
        { label: dictionary.nav.faq, href: path('/faq') },
        { label: dictionary.common.viewDocs, href: '/design-system' },
      ],
    },
    {
      title: dictionary.footer.account,
      links: [
        { label: dictionary.nav.signIn, href: path('/login') },
        { label: dictionary.nav.createAccount, href: path('/register') },
        { label: dictionary.nav.account, href: path('/account/sessions') },
        { label: dictionary.auth.login.setupLink, href: path('/onboarding') },
      ],
    },
    {
      title: dictionary.footer.legal,
      links: [
        { label: dictionary.nav.terms, href: path('/terms') },
        { label: dictionary.nav.privacy, href: path('/privacy') },
      ],
    },
  ];

  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-page py-section sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-3">
          <span className="inline-flex items-center gap-2 text-subheading font-bold text-content">
            <LeafIcon className="h-5 w-5 text-brand-700 dark:text-brand-300" />
            CROPSY
          </span>
          <p className="max-w-xs text-body-sm text-content-muted">{dictionary.footer.tagline}</p>
          <p className="text-caption text-content-subtle">{dictionary.footer.note}</p>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3">
            <p className="text-caption font-semibold uppercase tracking-wider text-content-subtle">
              {column.title}
            </p>
            <ul className="flex flex-col gap-2">
              {column.links.map((link) => (
                <li key={`${column.title}-${link.href}`}>
                  <Link
                    href={link.href}
                    className="rounded-xs text-body-sm text-content-muted transition-colors hover:text-brand-700 focus-ring dark:hover:text-brand-300"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line px-page py-5">
        <p className="mx-auto max-w-7xl text-caption text-content-subtle">
          {dictionary.footer.rights}
        </p>
      </div>
    </footer>
  );
}
