'use client';

import Link from 'next/link';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import {
  DataTable,
  QueryPanel,
  SectionHeader,
  useDashboardQuery,
} from '@/components/dashboard/dashboard-primitives';
import { localizedPath } from '@/lib/i18n';
import { formatDateTime, formatMoney, formatNumber, statusTone } from '@/lib/marketplace/format';
import { MarketplaceAccessGate } from './marketplace-access';

export function OrderConfirmation({ locale, orderId, dictionary }) {
  return (
    <MarketplaceAccessGate permission="orders.read" dictionary={dictionary}>
      <OrderConfirmationBody locale={locale} orderId={orderId} dictionary={dictionary} />
    </MarketplaceAccessGate>
  );
}

function OrderConfirmationBody({ locale, orderId, dictionary }) {
  const labels = dictionary.confirmation;
  const panelLabels = {
    loading: dictionary.common.loading,
    errorTitle: dictionary.common.errorTitle,
    retry: dictionary.common.retry,
    emptyTitle: dictionary.common.emptyTitle,
    emptyDescription: dictionary.common.emptyDescription,
    noFarmLead: dictionary.common.noResultsLead,
  };
  const orderQuery = useDashboardQuery(`/orders/orders/${orderId}`);
  const historyQuery = useDashboardQuery(`/orders/orders/${orderId}/history`);
  const order = orderQuery.data;

  return (
    <QueryPanel query={orderQuery} labels={panelLabels}>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3 rounded-panel border border-success-border bg-success-bg p-card">
          <h2 className="text-subheading font-semibold text-content">{labels.successTitle}</h2>
          <p className="text-body-sm text-content-muted">{labels.successLead}</p>
          <div className="flex flex-wrap gap-3 text-body-sm">
            <Link
              href={localizedPath(locale, `/marketplace/orders/${orderId}/tracking`)}
              className="font-semibold text-brand-700 hover:underline dark:text-brand-300"
            >
              {labels.trackOrder}
            </Link>
            <Link
              href={localizedPath(locale, '/marketplace/orders')}
              className="font-semibold text-brand-700 hover:underline dark:text-brand-300"
            >
              {labels.allOrders}
            </Link>
          </div>
        </section>

        <SectionHeader title={labels.orderTitle} source={dictionary.common.source} />

        <Card>
          <CardHeader className="border-none pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>{orderId}</CardTitle>
              <Badge tone={statusTone(order.status)} dot>
                {dictionary.statuses[order.status] || order.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [labels.checkoutId, order.checkoutId],
                [labels.seller, order.sellerUserId],
                [labels.placedAt, formatDateTime(order.placedAt, locale)],
                [dictionary.common.currency, order.currency],
                [labels.subtotal, formatMoney(order.subtotalAmount, order.currency, locale)],
                [labels.discount, formatMoney(order.discountAmount, order.currency, locale)],
                [labels.delivery, formatMoney(order.deliveryFeeAmount, order.currency, locale)],
                [labels.total, formatMoney(order.totalAmount, order.currency, locale)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-caption text-content-subtle">{label}</dt>
                  <dd className="mt-1 break-words text-body-sm font-medium text-content">
                    {value || dictionary.common.notAvailable}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-caption text-content-subtle">{labels.totalsLead}</p>
          </CardContent>
        </Card>

        <section className="flex flex-col gap-4">
          <h3 className="text-heading font-semibold text-content">{labels.itemsTitle}</h3>
          <DataTable
            caption={labels.itemsTitle}
            columns={[
              {
                id: 'listing',
                label: dictionary.common.listing,
                render: (item) => (
                  <Link
                    href={localizedPath(locale, `/marketplace/listings/${item.listingId}`)}
                    className="text-brand-700 hover:underline dark:text-brand-300"
                  >
                    {item.listingId}
                  </Link>
                ),
              },
              {
                id: 'quantity',
                label: dictionary.common.quantity,
                render: (item) => formatNumber(item.quantity, locale),
              },
              {
                id: 'unitPrice',
                label: dictionary.common.unitPrice,
                render: (item) => formatMoney(item.unitPrice, item.currency, locale),
              },
              {
                id: 'lineTotal',
                label: dictionary.common.lineTotal,
                render: (item) => formatMoney(item.lineTotal, item.currency, locale),
              },
            ]}
            rows={order.items || []}
            labels={panelLabels}
          />
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="text-heading font-semibold text-content">{labels.historyTitle}</h3>
          <QueryPanel query={historyQuery} labels={panelLabels}>
            <DataTable
              caption={labels.historyTitle}
              columns={[
                {
                  id: 'transition',
                  label: labels.transition,
                  render: (entry) =>
                    `${dictionary.statuses[entry.fromStatus] || entry.fromStatus} → ${
                      dictionary.statuses[entry.toStatus] || entry.toStatus
                    }`,
                },
                {
                  id: 'reason',
                  label: dictionary.common.reason,
                  render: (entry) => entry.reason || dictionary.common.notAvailable,
                },
                {
                  id: 'createdAt',
                  label: dictionary.common.createdAt,
                  render: (entry) => formatDateTime(entry.createdAt, locale),
                },
              ]}
              rows={historyQuery.data || []}
              labels={panelLabels}
              emptyTitle={labels.noHistory}
            />
          </QueryPanel>
        </section>
      </div>
    </QueryPanel>
  );
}
