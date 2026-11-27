'use client';

import Link from 'next/link';
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import {
  DataTable,
  QueryPanel,
  SectionHeader,
  useDashboardQuery,
} from '@/components/dashboard/dashboard-primitives';
import { localizedPath } from '@/lib/i18n';
import { formatDateTime, formatNumber, statusTone } from '@/lib/marketplace/format';
import { MarketplaceAccessGate } from './marketplace-access';

export function OrderTracking({ locale, orderId, dictionary }) {
  return (
    <MarketplaceAccessGate permission="orders.read" dictionary={dictionary}>
      <OrderTrackingBody locale={locale} orderId={orderId} dictionary={dictionary} />
    </MarketplaceAccessGate>
  );
}

function OrderTrackingBody({ locale, orderId, dictionary }) {
  const labels = dictionary.tracking;
  const panelLabels = {
    loading: dictionary.common.loading,
    errorTitle: dictionary.common.errorTitle,
    retry: dictionary.common.retry,
    emptyTitle: dictionary.common.emptyTitle,
    emptyDescription: dictionary.common.emptyDescription,
    noFarmLead: dictionary.common.noResultsLead,
  };
  const orderQuery = useDashboardQuery(`/orders/orders/${orderId}`);
  const shipmentQuery = useDashboardQuery(
    '/logistics/shipments',
    { orderId },
    { enabled: Boolean(orderId) },
  );
  const shipment = shipmentQuery.data?.[0];
  const trackingQuery = useDashboardQuery(
    `/logistics/shipments/${shipment?.id || 'unknown'}/tracking`,
    {},
    { enabled: Boolean(shipment?.id) },
  );
  const tracking = trackingQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.title}
        lead={labels.lead}
        source={dictionary.common.source}
        actions={
          <Link
            href={localizedPath(locale, '/marketplace/orders')}
            className="text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
          >
            {labels.allOrders}
          </Link>
        }
      />

      <QueryPanel query={orderQuery} labels={panelLabels}>
        <Card>
          <CardHeader className="border-none pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>{orderId}</CardTitle>
              {orderQuery.data?.status ? (
                <Badge tone={statusTone(orderQuery.data.status)} dot>
                  {dictionary.statuses[orderQuery.data.status] || orderQuery.data.status}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
        </Card>
      </QueryPanel>

      <QueryPanel query={shipmentQuery} labels={panelLabels}>
        {!shipment ? (
          <EmptyState title={labels.noShipment} description={labels.noShipmentLead} />
        ) : (
          <Card>
            <CardHeader className="border-none pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>
                  {shipment.trackingNumber || shipment.referenceKey || shipment.id}
                </CardTitle>
                <Badge tone={statusTone(shipment.status)} dot>
                  {dictionary.statuses[shipment.status] || shipment.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  [labels.shipmentId, shipment.id],
                  [labels.reference, shipment.referenceKey],
                  [labels.shippedAt, formatDateTime(shipment.shippedAt, locale)],
                  [labels.deliveredAt, formatDateTime(shipment.deliveredAt, locale)],
                  [labels.distance, shipment.plannedDistanceKm],
                  [labels.provider, shipment.providerId],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-caption text-content-subtle">{label}</dt>
                    <dd className="mt-1 break-words text-body-sm font-medium text-content">
                      {value === null || value === undefined || value === ''
                        ? dictionary.common.notAvailable
                        : typeof value === 'number'
                          ? `${formatNumber(value, locale)} km`
                          : value}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        )}
      </QueryPanel>

      {shipment ? (
        <QueryPanel query={trackingQuery} labels={panelLabels}>
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3">
              <h3 className="text-heading font-semibold text-content">{labels.liveTitle}</h3>
              <p className="text-body-sm text-content-muted">
                {tracking?.liveLocation
                  ? JSON.stringify(tracking.liveLocation)
                  : labels.liveUnavailable}
              </p>
              {tracking?.route ? (
                <p className="text-caption text-content-muted">
                  {labels.routeSource}: {tracking.route.source || dictionary.common.notAvailable}
                  {tracking.route.distanceKm !== null && tracking.route.distanceKm !== undefined
                    ? ` · ${formatNumber(tracking.route.distanceKm, locale)} km`
                    : ''}
                </p>
              ) : null}
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="text-heading font-semibold text-content">{labels.eventsTitle}</h3>
              <DataTable
                caption={labels.eventsTitle}
                columns={[
                  {
                    id: 'occurredAt',
                    label: dictionary.common.occurredAt,
                    render: (event) => formatDateTime(event.occurredAt, locale),
                  },
                  {
                    id: 'status',
                    label: dictionary.common.status,
                    render: (event) => dictionary.statuses[event.status] || event.status,
                  },
                  {
                    id: 'source',
                    label: labels.source,
                    render: (event) => event.source || dictionary.common.notAvailable,
                  },
                  {
                    id: 'note',
                    label: dictionary.common.note,
                    render: (event) => event.note || dictionary.common.notAvailable,
                  },
                ]}
                rows={tracking?.events || []}
                labels={panelLabels}
                emptyTitle={labels.noEvents}
              />
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="text-heading font-semibold text-content">{labels.deliveriesTitle}</h3>
              <DataTable
                caption={labels.deliveriesTitle}
                columns={[
                  {
                    id: 'attempt',
                    label: labels.attempt,
                    render: (delivery) => delivery.attemptNumber,
                  },
                  {
                    id: 'phase',
                    label: dictionary.common.phase,
                    render: (delivery) => delivery.phase || dictionary.common.notAvailable,
                  },
                  {
                    id: 'status',
                    label: dictionary.common.status,
                    render: (delivery) => dictionary.statuses[delivery.status] || delivery.status,
                  },
                  {
                    id: 'scheduled',
                    label: labels.scheduled,
                    render: (delivery) => formatDateTime(delivery.scheduledAt, locale),
                  },
                  {
                    id: 'delivered',
                    label: labels.delivered,
                    render: (delivery) => formatDateTime(delivery.deliveredAt, locale),
                  },
                ]}
                rows={tracking?.deliveries || []}
                labels={panelLabels}
                emptyTitle={labels.noDeliveries}
              />
            </section>
          </div>
        </QueryPanel>
      ) : null}
    </div>
  );
}
