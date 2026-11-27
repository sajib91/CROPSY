'use client';

import Link from 'next/link';
import { useAuth } from '@/components/auth/auth-provider';
import { canAccess } from '@/lib/auth/roles';
import { localizedPath } from '@/lib/i18n';
import { cn } from '@/components/ui';

export function MarketplaceNav({ locale, labels, active }) {
  const { session, isAuthenticated } = useAuth();

  const items = [
    { id: 'home', label: labels.home, href: '/marketplace' },
    { id: 'categories', label: labels.categories, href: '/marketplace/categories' },
    { id: 'search', label: labels.search, href: '/marketplace/search' },
    { id: 'filters', label: labels.filters, href: '/marketplace/filters' },
  ];

  if (isAuthenticated) {
    if (canAccess(session, 'orders.read')) {
      items.push({ id: 'cart', label: labels.cart, href: '/marketplace/cart' });
      items.push({ id: 'orders', label: labels.orders, href: '/marketplace/orders' });
    }
    if (canAccess(session, 'listings.manage')) {
      items.push({
        id: 'manage',
        label: labels.myListings,
        href: '/marketplace/seller/listings',
      });
    }
  }

  return (
    <nav aria-label={labels.aria} className="-mx-page overflow-x-auto px-page pb-1">
      <ul className="flex min-w-max items-center gap-2">
        {items.map((item) => {
          const current = active === item.id;
          return (
            <li key={item.id}>
              <Link
                href={localizedPath(locale, item.href)}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-control items-center rounded-control border px-4 text-body-sm font-medium transition-colors',
                  current
                    ? 'border-brand-600 bg-brand-600 text-content-on-brand'
                    : 'border-line bg-surface text-content-muted hover:border-line-strong hover:text-content',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
