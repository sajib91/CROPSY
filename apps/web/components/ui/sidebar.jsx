'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cn } from './cn';
import { LeafIcon, MenuIcon, XIcon } from './icons';

export function SidebarLink({ href, label, icon, badge, active = false, onClick, className }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-control px-3 py-2 text-body-sm font-medium transition-colors focus-ring',
        active
          ? 'bg-brand-50 text-brand-800 dark:bg-brand-950/50 dark:text-brand-200'
          : 'text-content-muted hover:bg-surface-muted hover:text-content',
        className,
      )}
    >
      {icon ? <span className="text-content-subtle">{icon}</span> : null}
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-caption text-content-muted">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function isActivePath(pathname, href) {
  if (!href || href === '#') return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContent({ sections, footer, pathname, onNavigate }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-control bg-brand-700 text-white dark:bg-brand-500 dark:text-content-on-brand">
          <LeafIcon className="h-5 w-5" />
        </span>
        <span className="text-subheading font-bold tracking-tight text-content">CROPSY</span>
      </div>

      <nav aria-label="Sidebar" className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {sections.map((section, index) => (
          <div key={section.title ?? `section-${index}`}>
            {section.title ? (
              <p className="px-3 pb-2 text-caption font-semibold uppercase tracking-wider text-content-subtle">
                {section.title}
              </p>
            ) : null}
            <div className="flex flex-col gap-1">
              {section.items.map((item) => (
                <SidebarLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  badge={item.badge}
                  active={isActivePath(pathname, item.href)}
                  onClick={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {footer ? <div className="border-t border-line p-4">{footer}</div> : null}
    </div>
  );
}

export function Sidebar({ sections = [], footer, className }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    drawerRef.current?.querySelector('a, button')?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const content = (
    <SidebarContent
      sections={sections}
      footer={footer}
      pathname={pathname}
      onNavigate={() => setOpen(false)}
    />
  );

  return (
    <>
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-surface px-page md:hidden">
        <span className="flex items-center gap-2 font-bold text-content">
          <LeafIcon className="h-5 w-5 text-brand-700 dark:text-brand-300" />
          CROPSY
        </span>
        <button
          type="button"
          aria-label="Open sidebar"
          aria-expanded={open}
          aria-controls="cropsy-sidebar-drawer"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-control text-content-muted hover:bg-surface-muted hover:text-content focus-ring"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </div>

      <aside
        className={cn(
          'sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-surface md:block',
          className,
        )}
      >
        {content}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="absolute inset-0 animate-fade-in bg-surface-inverse/60 backdrop-blur-sm"
          />
          <aside
            ref={drawerRef}
            id="cropsy-sidebar-drawer"
            aria-label="Mobile sidebar"
            className="absolute left-0 top-0 h-full w-72 max-w-[85vw] animate-slide-up border-r border-line bg-surface shadow-overlay"
          >
            <button
              type="button"
              aria-label="Close sidebar"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-control text-content-muted hover:bg-surface-muted hover:text-content focus-ring"
            >
              <XIcon className="h-5 w-5" />
            </button>
            {content}
          </aside>
        </div>
      ) : null}
    </>
  );
}
