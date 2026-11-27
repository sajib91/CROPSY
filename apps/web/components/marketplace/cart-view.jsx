'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  buttonStyles,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  InlineError,
} from '@/components/ui';
import {
  QueryPanel,
  SectionHeader,
  useDashboardQuery,
} from '@/components/dashboard/dashboard-primitives';
import { removeCartItem, updateCartItem } from '@/lib/marketplace/client';
import { localizedPath } from '@/lib/i18n';
import { formatMoney, formatNumber, statusTone } from '@/lib/marketplace/format';
import { MarketplaceAccessGate } from './marketplace-access';

export function CartView({ locale, dictionary }) {
  return (
    <MarketplaceAccessGate permission="orders.read" dictionary={dictionary}>
      <CartBody locale={locale} dictionary={dictionary} />
    </MarketplaceAccessGate>
  );
}

function cartIssues(cart, labels) {
  const issues = [];
  if (!cart?.items?.length) return issues;
  for (const item of cart.items) {
    const listing = item.listing;
    if (!listing) {
      issues.push(`${item.listingId}: ${labels.listingMissing}`);
      continue;
    }
    if (listing.status !== 'ACTIVE') {
      issues.push(`${listing.title || item.listingId}: ${labels.listingNotActive}`);
    }
    if (listing.currency && cart.currency && listing.currency !== cart.currency) {
      issues.push(`${listing.title || item.listingId}: ${labels.mixedCurrency}`);
    }
    if (Number(item.quantity) < Number(listing.minOrderQuantity || 0)) {
      issues.push(`${listing.title || item.listingId}: ${labels.belowMinimum}`);
    }
    if (Number(item.quantity) > Number(listing.quantityAvailable)) {
      issues.push(`${listing.title || item.listingId}: ${labels.exceedsStock}`);
    }
  }
  return issues;
}

function CartBody({ locale, dictionary }) {
  const labels = dictionary.cart;
  const router = useRouter();
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState({});
  const [actionError, setActionError] = useState('');
  const query = useDashboardQuery('/orders/cart');
  const cart = query.data;

  const panelLabels = {
    loading: dictionary.common.loading,
    errorTitle: dictionary.common.errorTitle,
    retry: dictionary.common.retry,
    emptyTitle: dictionary.common.emptyTitle,
    emptyDescription: dictionary.common.emptyDescription,
    noFarmLead: dictionary.common.noResultsLead,
  };

  useEffect(() => {
    if (!cart?.items) return;
    const next = {};
    for (const item of cart.items) next[item.listingId] = String(item.quantity);
    setDrafts(next);
  }, [cart]);

  function setDraft(listingId, value) {
    setDrafts((current) => ({ ...current, [listingId]: value }));
  }

  async function saveQuantity(listingId) {
    setActionError('');
    const quantity = Number(drafts[listingId]);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setActionError(labels.invalidQuantity);
      return;
    }
    setBusy((current) => ({ ...current, [listingId]: true }));
    try {
      await updateCartItem(listingId, { quantity });
      await query.reload();
      router.refresh();
    } catch (error) {
      setActionError(error?.message || dictionary.common.actionFailed);
    } finally {
      setBusy((current) => ({ ...current, [listingId]: false }));
    }
  }

  async function remove(listingId) {
    setActionError('');
    setBusy((current) => ({ ...current, [listingId]: true }));
    try {
      await removeCartItem(listingId);
      await query.reload();
      router.refresh();
    } catch (error) {
      setActionError(error?.message || dictionary.common.actionFailed);
    } finally {
      setBusy((current) => ({ ...current, [listingId]: false }));
    }
  }

  const issues = cartIssues(cart, labels);
  const canCheckout = Boolean(cart?.items?.length) && issues.length === 0;

  return (
    <QueryPanel query={query} labels={panelLabels}>
      <div className="flex flex-col gap-6">
        <SectionHeader
          title={labels.title}
          lead={labels.lead}
          source={dictionary.common.source}
          actions={
            <Link
              href={localizedPath(locale, '/marketplace/search')}
              className="text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
            >
              {labels.continueShopping}
            </Link>
          }
        />

        {actionError ? <InlineError title={actionError} /> : null}

        {!cart?.items?.length ? (
          <div className="rounded-card border border-line bg-surface p-card text-body-sm text-content-muted">
            {labels.emptyCart}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <ul className="flex flex-col gap-4">
              {cart.items.map((item) => {
                const listing = item.listing;
                const snapshot = formatMoney(item.unitPriceSnapshot, item.currency, locale);
                const current = formatMoney(listing?.unitPrice, listing?.currency, locale);
                return (
                  <li key={item.id || item.listingId}>
                    <Card>
                      <CardHeader className="border-none pb-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle>
                              <Link
                                href={localizedPath(
                                  locale,
                                  `/marketplace/listings/${item.listingId}`,
                                )}
                                className="hover:underline"
                              >
                                {listing?.title || item.listingId}
                              </Link>
                            </CardTitle>
                            {listing?.status ? (
                              <Badge tone={statusTone(listing.status)} className="mt-2">
                                {dictionary.statuses[listing.status] || listing.status}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-subheading font-semibold text-content">
                            {snapshot || dictionary.common.notAvailable}
                          </p>
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4 pt-0 sm:flex-row sm:items-end">
                        <div className="w-full sm:max-w-[12rem]">
                          <Field label={dictionary.common.quantity}>
                            <Input
                              id={`cart-quantity-${item.listingId}`}
                              type="number"
                              min={listing?.minOrderQuantity || 1}
                              max={listing?.quantityAvailable || undefined}
                              step="any"
                              value={drafts[item.listingId] ?? String(item.quantity)}
                              onChange={(event) => setDraft(item.listingId, event.target.value)}
                            />
                          </Field>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={busy[item.listingId]}
                            onClick={() => saveQuantity(item.listingId)}
                          >
                            {labels.update}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={busy[item.listingId]}
                            onClick={() => remove(item.listingId)}
                          >
                            {labels.remove}
                          </Button>
                        </div>
                        <div className="sm:ml-auto sm:text-right">
                          <p className="text-caption text-content-muted">
                            {labels.stock}:{' '}
                            {formatNumber(listing?.quantityAvailable, locale) ??
                              dictionary.common.notAvailable}
                          </p>
                          <p className="text-caption text-content-muted">
                            {labels.currentPrice}: {current || dictionary.common.notAvailable}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>

            <aside className="h-fit rounded-card border border-line bg-surface p-card">
              <h2 className="text-subheading font-semibold text-content">{labels.summaryTitle}</h2>
              <dl className="mt-4 flex flex-col gap-3 text-body-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-content-muted">{labels.cartSubtotal}</dt>
                  <dd className="font-medium text-content">
                    {formatMoney(cart.subtotalAmount, cart.currency, locale) ||
                      dictionary.common.notAvailable}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-content-muted">{dictionary.common.currency}</dt>
                  <dd className="font-medium text-content">
                    {cart.currency || dictionary.common.notAvailable}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-caption text-content-subtle">{labels.subtotalLead}</p>
              {issues.length ? (
                <ul className="mt-4 flex list-disc flex-col gap-1 pl-5 text-caption text-danger">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}
              {canCheckout ? (
                <Link
                  href={localizedPath(locale, '/marketplace/checkout')}
                  className={`${buttonStyles({ fullWidth: true })} mt-5`}
                >
                  {labels.checkout}
                </Link>
              ) : (
                <Button type="button" fullWidth disabled className="mt-5">
                  {labels.checkout}
                </Button>
              )}
            </aside>
          </div>
        )}
      </div>
    </QueryPanel>
  );
}

export { cartIssues };
