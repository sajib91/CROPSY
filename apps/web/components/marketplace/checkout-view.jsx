'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Button,
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
import { createCheckout } from '@/lib/marketplace/client';
import { localizedPath } from '@/lib/i18n';
import { formatMoney, formatNumber } from '@/lib/marketplace/format';
import { cartIssues } from './cart-view';
import { MarketplaceAccessGate } from './marketplace-access';

function newReferenceKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CheckoutView({ locale, dictionary }) {
  return (
    <MarketplaceAccessGate permission="orders.manage" dictionary={dictionary}>
      <CheckoutBody locale={locale} dictionary={dictionary} />
    </MarketplaceAccessGate>
  );
}

function CheckoutBody({ locale, dictionary }) {
  const labels = dictionary.checkout;
  const router = useRouter();
  const [referenceKey, setReferenceKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const query = useDashboardQuery('/orders/cart');
  const cart = query.data;

  useEffect(() => {
    setReferenceKey(newReferenceKey());
  }, []);

  const panelLabels = {
    loading: dictionary.common.loading,
    errorTitle: dictionary.common.errorTitle,
    retry: dictionary.common.retry,
    emptyTitle: dictionary.common.emptyTitle,
    emptyDescription: dictionary.common.emptyDescription,
    noFarmLead: dictionary.common.noResultsLead,
  };

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (referenceKey.trim().length < 8) {
      setError(labels.referenceTooShort);
      return;
    }
    setBusy(true);
    try {
      const checkout = await createCheckout({ referenceKey: referenceKey.trim() });
      const orderId = checkout?.orders?.[0]?.id;
      if (orderId) {
        router.push(localizedPath(locale, `/marketplace/orders/${orderId}/confirmation`));
      } else {
        setError(labels.noOrderReturned);
      }
    } catch (requestError) {
      setError(requestError?.message || dictionary.common.actionFailed);
    } finally {
      setBusy(false);
    }
  }

  const issues = cartIssues(cart, labels);

  return (
    <QueryPanel query={query} labels={panelLabels}>
      <SectionHeader title={labels.title} lead={labels.lead} source={dictionary.common.source} />
      {error ? <InlineError title={error} /> : null}

      {!cart?.items?.length ? (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-card">
          <p className="text-body-sm text-content-muted">{labels.emptyCart}</p>
          <Link
            href={localizedPath(locale, '/marketplace/search')}
            className="text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
          >
            {dictionary.cart.continueShopping}
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card>
            <CardHeader className="border-none pb-3">
              <CardTitle>{labels.itemsTitle}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="divide-y divide-line">
                {cart.items.map((item) => (
                  <li
                    key={item.id || item.listingId}
                    className="flex flex-col gap-2 py-3 first:pt-0"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-body-sm font-medium text-content">
                          {item.listing?.title || item.listingId}
                        </p>
                        <p className="text-caption text-content-muted">
                          {dictionary.common.quantity}:{' '}
                          {formatNumber(item.quantity, locale) ?? dictionary.common.notAvailable}
                        </p>
                      </div>
                      <p className="text-body-sm font-medium text-content">
                        {formatMoney(item.unitPriceSnapshot, item.currency, locale) ||
                          dictionary.common.notAvailable}
                      </p>
                    </div>
                    <p className="text-caption text-content-subtle">
                      {labels.currentPrice}:{' '}
                      {formatMoney(item.listing?.unitPrice, item.listing?.currency, locale) ||
                        dictionary.common.notAvailable}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <form
            onSubmit={submit}
            className="flex h-fit flex-col gap-4 rounded-card border border-line bg-surface p-card"
          >
            <div>
              <h2 className="text-subheading font-semibold text-content">{labels.summaryTitle}</h2>
              <dl className="mt-3 flex flex-col gap-2 text-body-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-content-muted">{dictionary.cart.cartSubtotal}</dt>
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
              <p className="mt-3 text-caption text-content-subtle">{labels.backendPricingLead}</p>
            </div>

            <Field label={labels.referenceLabel} hint={labels.referenceHint}>
              <Input
                id="checkout-reference"
                value={referenceKey}
                onChange={(event) => setReferenceKey(event.target.value)}
                minLength={8}
                maxLength={255}
                required
              />
            </Field>

            {issues.length ? (
              <ul className="flex list-disc flex-col gap-1 pl-5 text-caption text-danger">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}

            <Button
              type="submit"
              fullWidth
              loading={busy}
              loadingText={labels.submitting}
              disabled={issues.length > 0 || cart.items.length === 0}
            >
              {labels.submit}
            </Button>
            <Link
              href={localizedPath(locale, '/marketplace/cart')}
              className="text-center text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
            >
              {labels.backToCart}
            </Link>
          </form>
        </div>
      )}
    </QueryPanel>
  );
}
