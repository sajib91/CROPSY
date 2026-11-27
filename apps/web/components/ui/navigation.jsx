'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from './cn';
import { LeafIcon, MenuIcon, XIcon } from './icons';

export function NavBrand({ href = '/', label = 'CROPSY', className }) {
  return (
    <Link
      href={href}
      className={cn('inline-flex items-center gap-2 rounded-control focus-ring', className)}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-control bg-brand-700 text-white dark:bg-brand-500 dark:text-content-on-brand">
        <LeafIcon className="h-5 w-5" />
      </span>
      <span className="text-subheading font-bold tracking-tight text-content">{label}</span>
    </Link>
  );
}

export function NavLink({ href, label, active = false, badge, onClick, className }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-control px-3 py-2 text-body-sm font-medium transition-colors focus-ring',
        active
          ? 'bg-brand-50 text-brand-800 dark:bg-brand-950/50 dark:text-brand-200'
          : 'text-content-muted hover:bg-surface-muted hover:text-content',
        className,
      )}
    >
      {label}
      {badge ? <span className="text-caption text-content-subtle">{badge}</span> : null}
    </Link>
  );
}

function isActivePath(pathname, href) {
  if (!href || href === '#') return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Navbar({
  brand = 'CROPSY',
  brandHref = '/',
  links = [],
  actions,
  labels = {},
  className,
  ...props
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header
      {...props}
      className={cn(
        'sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75',
        className,
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-page">
        <NavBrand href={brandHref} label={brand} />

        <nav
          aria-label={labels.primary ?? 'Primary'}
          className="hidden md:flex md:items-center md:gap-1"
        >
          {links.map((link) => (
            <NavLink
              key={link.href}
              href={link.href}
              label={link.label}
              badge={link.badge}
              active={isActivePath(pathname, link.href)}
            />
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">{actions}</div>

        <button
          type="button"
          aria-label={
            open
              ? (labels.closeMenu ?? 'Close navigation menu')
              : (labels.openMenu ?? 'Open navigation menu')
          }
          aria-expanded={open}
          aria-controls="cropsy-mobile-navigation"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-control text-content-muted hover:bg-surface-muted hover:text-content focus-ring md:hidden"
        >
          {open ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <nav
          id="cropsy-mobile-navigation"
          aria-label={labels.mobile ?? 'Mobile'}
          className="border-t border-line bg-surface px-page py-3 md:hidden"
        >
          <div className="flex flex-col gap-1">
            {links.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                label={link.label}
                badge={link.badge}
                active={isActivePath(pathname, link.href)}
                onClick={() => setOpen(false)}
              />
            ))}
          </div>
          {actions ? (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">{actions}</div>
          ) : null}
        </nav>
      ) : null}
    </header>
  );
}
