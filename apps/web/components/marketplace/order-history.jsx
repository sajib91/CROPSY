'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Field, Input, InlineError, Modal, Select } from '@/components/ui';
import {
  DataTable,
  QueryPanel,
  SectionHeader,
  useDashboardQuery,
} from '@/components/dashboard/dashboard-primitives';
import { cancelOrder } from '@/lib/marketplace/client';
import { localizedPath } from '@/lib/i18n';
import { formatDateTime, formatMoney, statusTone } from '@/lib/marketplace/format';
import { MarketplaceAccessGate } from './marketplace-access';

const CANCELLABLE = new Set([
  'PENDING',
  'PAYMENT_PENDING',
  'PAYMENT_FAILED',
  'CONFIRMED',
  'PROCESSING',
]);

export function OrderHistory({ locale, dictionary }) {
  return (
    <MarketplaceAccessGate permission="orders.read" dictionary={dictionary}>
      <OrderHistoryBody locale={locale} dictionary={dictionary} />
    </MarketplaceAccessGate>
  );
}

function OrderHistoryBody({ locale, dictionary }) {
  const labels = dictionary.orders;
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const query = useDashboardQuery('/orders/orders', { status, limit: 50 });

  const panelLabels = {
    loading: dictionary.common.loading,
    errorTitle: dictionary.common.errorTitle,
    retry: dictionary.common.retry,
    emptyTitle: dictionary.common.emptyTitle,
    emptyDescription: dictionary.common.emptyDescription,
    noFarmLead: dictionary.common.noResultsLead,
  };

  async function confirmCancel() {
    if (!selected) return;
    setError('');
    setBusy(true);
    try {
      await cancelOrder(selected.id, reason.trim() ? { reason: reason.trim() } : {});
      setSelected(null);
      setReason('');
      await query.reload();
    } catch (requestError) {
      setError(requestError?.message || dictionary.common.actionFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title={labels.title} lead={labels.lead} source={dictionary.common.source} />

      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-[18rem]">
          <Field label={labels.statusFilter}>
            <Select
              id="order-status-filter"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              options={[
                { value: '', label: labels.allStatuses },
                ...Object.entries(dictionary.statuses).map(([code, label]) => ({
                  value: code,
                  label,
                })),
              ]}
            />
          </Field>
        </div>
      </div>

      {error ? <InlineError title={error} /> : null}

      <QueryPanel query={query} labels={panelLabels}>
        <DataTable
          caption={labels.title}
          columns={[
            {
              id: 'placedAt',
              label: labels.placedAt,
              render: (order) => formatDateTime(order.placedAt, locale),
            },
            {
              id: 'status',
              label: dictionary.common.status,
              render: (order) => (
                <Badge tone={statusTone(order.status)} dot>
                  {dictionary.statuses[order.status] || order.status}
                </Badge>
              ),
            },
            {
              id: 'seller',
              label: labels.seller,
              render: (order) => order.sellerUserId || dictionary.common.notAvailable,
            },
            {
              id: 'items',
              label: labels.items,
              render: (order) => order.items?.length ?? 0,
            },
            {
              id: 'total',
              label: dictionary.common.total,
              render: (order) => formatMoney(order.totalAmount, order.currency, locale),
            },
            {
              id: 'actions',
              label: dictionary.common.actions,
              render: (order) => (
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={localizedPath(locale, `/marketplace/orders/${order.id}/confirmation`)}
                    className="text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
                  >
                    {labels.details}
                  </Link>
                  <Link
                    href={localizedPath(locale, `/marketplace/orders/${order.id}/tracking`)}
                    className="text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
                  >
                    {labels.track}
                  </Link>
                  {CANCELLABLE.has(order.status) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelected(order);
                        setReason('');
                        setError('');
                      }}
                    >
                      {labels.cancel}
                    </Button>
                  ) : null}
                </div>
              ),
            },
          ]}
          rows={query.data || []}
          labels={panelLabels}
          emptyTitle={labels.noOrders}
        />
      </QueryPanel>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={labels.cancelTitle}
        description={labels.cancelLead}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSelected(null)}>
              {dictionary.common.cancel}
            </Button>
            <Button variant="danger" loading={busy} onClick={confirmCancel}>
              {labels.cancelConfirm}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-body-sm text-content-muted">
            {selected?.id} · {dictionary.statuses[selected?.status] || selected?.status}
          </p>
          <Field label={labels.cancelReason}>
            <Input
              id="cancel-reason"
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
              placeholder={labels.cancelReasonPlaceholder}
            />
          </Field>
          {error ? <InlineError title={error} /> : null}
        </div>
      </Modal>
    </div>
  );
}
