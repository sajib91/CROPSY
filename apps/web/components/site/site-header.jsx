'use client';

import Link from 'next/link';
import { useAuth } from '@/components/auth/auth-provider';
import { ROLE_DASHBOARDS } from '@/lib/dashboards/roles';
import { canAccess, hasAnyRole, hasRole } from '@/lib/auth/roles';
import { localizedPath } from '@/lib/i18n';
import { buttonStyles, Navbar, ThemeToggle } from '../ui';
import { LocaleSwitcher } from './locale-switcher';

export function SiteHeader({ locale, dictionary }) {
  const { isAuthenticated, signOut, session } = useAuth();
  const isFarmer = hasRole(session, 'FARMER');
  const dashboardLinks = ROLE_DASHBOARDS.filter((config) =>
    hasAnyRole(session, config.roleCodes),
  ).map((config) => ({
    label: dictionary.pages[config.pageKey]?.title || config.slug,
    href: localizedPath(locale, `/${config.slug}/dashboard`),
  }));
  const links = [
    { label: dictionary.nav.home, href: localizedPath(locale, '/') },
    { label: dictionary.nav.how, href: localizedPath(locale, '/how-it-works') },
    { label: dictionary.nav.farmers, href: localizedPath(locale, '/farmers') },
    { label: dictionary.nav.buyers, href: localizedPath(locale, '/buyers') },
    { label: dictionary.nav.marketplace, href: localizedPath(locale, '/marketplace') },
    {
      label: dictionary.nav.intelligence,
      href: localizedPath(locale, '/agricultural-intelligence'),
    },
    { label: dictionary.nav.pricing, href: localizedPath(locale, '/pricing') },
    ...(isFarmer
      ? [
          {
            label: dictionary.nav.dashboard,
            href: localizedPath(locale, '/farmers/dashboard'),
          },
        ]
      : []),
    ...dashboardLinks,
  ];

  return (
    <Navbar
      brandHref={localizedPath(locale, '/')}
      links={links}
      labels={{
        primary: dictionary.nav.primary,
        mobile: dictionary.nav.mobile,
        openMenu: dictionary.nav.openMenu,
        closeMenu: dictionary.nav.closeMenu,
      }}
      actions={
        <>
          <LocaleSwitcher currentLocale={locale} label={dictionary.common.language} />
          <ThemeToggle label={dictionary.common.toggleTheme} />
          {isAuthenticated && canAccess(session, 'orders.read') ? (
            <Link
              href={localizedPath(locale, '/marketplace/cart')}
              className={buttonStyles({ variant: 'secondary', size: 'sm' })}
            >
              {dictionary.marketplaceUi.nav.cart}
            </Link>
          ) : null}
          {isAuthenticated ? (
            <Link
              href={localizedPath(locale, '/account/sessions')}
              className={buttonStyles({ variant: 'secondary', size: 'sm' })}
            >
              {dictionary.nav.account}
            </Link>
          ) : (
            <Link
              href={localizedPath(locale, '/login')}
              className={buttonStyles({ variant: 'secondary', size: 'sm' })}
            >
              {dictionary.nav.signIn}
            </Link>
          )}
          {isAuthenticated ? (
            <button
              type="button"
              onClick={signOut}
              className={buttonStyles({ variant: 'ghost', size: 'sm' })}
            >
              {dictionary.nav.signOut}
            </button>
          ) : null}
          <Link
            href={localizedPath(locale, '/contact')}
            className={buttonStyles({ size: 'sm', className: 'hidden lg:inline-flex' })}
          >
            {dictionary.common.contactUs}
          </Link>
        </>
      }
    />
  );
}
