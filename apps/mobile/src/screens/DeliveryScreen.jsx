import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { endpoints } from '../lib/api/endpoints';
import { useResource } from '../lib/hooks/useResource';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  OptionPicker,
  Row,
  Screen,
  ScreenHeader,
  SectionHeader,
  TextField,
} from '../lib/ui/components';
import { useApp } from '../state/AppContext';

const SHIPMENT_STATUSES = [
  'PENDING',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
  'RETURNED',
  'CANCELLED',
];

function asArray(data) {
  return Array.isArray(data) ? data : data?.deliveries || data?.events || [];
}

export default function DeliveryScreen({ route }) {
  const { api, t } = useApp();
  const orderId = route?.params?.orderId;
  const [selected, setSelected] = useState(null);
  const [scheduledAt, setScheduledAt] = useState(() => new Date().toISOString());
  const [status, setStatus] = useState('IN_TRANSIT');
  const [proofUrl, setProofUrl] = useState('');
  const [deliveryId, setDeliveryId] = useState('');
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);

  const resource = useResource(['shipments', orderId], () =>
    api.get(endpoints.logistics.shipments, { query: orderId ? { orderId } : undefined }),
  );
  const shipments = asArray(resource.data);
  const selectedId = selected?.id || selected?.shipmentId;

  const deliveries = useResource(
    ['deliveries', selectedId],
    () => api.get(endpoints.logistics.deliveries, { query: { shipmentId: selectedId } }),
    { enabled: Boolean(selectedId), deps: [selectedId] },
  );
  const tracking = useResource(
    ['shipment-tracking', selectedId],
    () => api.get(endpoints.logistics.shipmentTracking(selectedId)),
    { enabled: Boolean(selectedId), deps: [selectedId] },
  );

  const deliveryList = useMemo(() => asArray(deliveries.data), [deliveries.data]);
  const events = Array.isArray(tracking.data?.events) ? tracking.data.events : [];

  useEffect(() => {
    setDeliveryId(deliveryList[0]?.id || '');
  }, [deliveryList]);

  const isoDateTime = (value) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new Error(t('common.invalidDate'));
    return parsed.toISOString();
  };

  const performAction = async (action) => {
    if (!selectedId) return;
    setBusy(true);
    setActionError(null);
    try {
      if (action === 'pickup') {
        await api.post(endpoints.logistics.shipmentPickup(selectedId), {
          scheduledAt: isoDateTime(scheduledAt),
        });
      } else if (action === 'status') {
        await api.post(endpoints.logistics.shipmentStatus(selectedId), { status });
      } else if (action === 'proof') {
        if (!deliveryId) throw new Error(t('delivery.noDeliveries'));
        await api.post(endpoints.logistics.deliveryProof(deliveryId), {
          proofUrl: proofUrl.trim(),
        });
      }
      await Promise.allSettled([resource.refresh(), deliveries.refresh(), tracking.refresh()]);
    } catch (error) {
      setActionError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<ScreenHeader title={t('delivery.title')} />}
      refreshing={resource.refreshing}
      onRefresh={resource.refresh}
    >
      {resource.error ? (
        <ErrorState
          message={resource.error.message}
          onRetry={resource.refresh}
          retryLabel={t('common.retry')}
        />
      ) : null}
      {resource.loading && shipments.length === 0 ? (
        <LoadingState label={t('common.loading')} />
      ) : null}
      {shipments.length === 0 && !resource.loading ? (
        <EmptyState title={t('delivery.noShipments')} />
      ) : null}

      {shipments.map((shipment, index) => {
        const id = shipment.id || shipment.shipmentId;
        const isSelected = selectedId === id;
        return (
          <Card key={id || index} className="mb-3">
            <Badge tone={shipment.status === 'DELIVERED' ? 'success' : 'info'}>
              {shipment.status || '—'}
            </Badge>
            <Row label={t('delivery.trackingNumber')} value={shipment.trackingNumber} />
            <Row
              label={t('orders.orderNumber', { id: shipment.orderId })}
              value={shipment.referenceKey}
            />
            <Row label={t('delivery.provider')} value={shipment.providerId} />
            <Row label={t('delivery.shippedAt')} value={shipment.shippedAt} />
            <Row
              label={t('delivery.deliveredAt')}
              value={shipment.deliveredAt}
              last={!isSelected}
            />
            <View className="mt-4 flex-row gap-2">
              <View className="flex-1">
                <Button
                  title={isSelected ? t('common.close') : t('common.details')}
                  variant="secondary"
                  onPress={() => {
                    setSelected(isSelected ? null : shipment);
                    setDeliveryId('');
                    setActionError(null);
                  }}
                />
              </View>
            </View>
            {isSelected ? (
              <View className="mt-4 border-t border-slate-800 pt-3">
                <SectionHeader title={t('delivery.timeline')} />
                {tracking.loading ? <LoadingState label={t('common.loading')} /> : null}
                {events.length === 0 && !tracking.loading ? (
                  <Notice>{t('common.noData')}</Notice>
                ) : null}
                {events.map((event, eventIndex) => (
                  <Row
                    key={event.id || eventIndex}
                    label={event.action || event.type || `#${eventIndex + 1}`}
                    value={event.createdAt || event.note || ''}
                    last={eventIndex === events.length - 1}
                  />
                ))}

                <SectionHeader title={t('delivery.actions')} />
                <TextField
                  label={t('delivery.scheduledAt')}
                  value={scheduledAt}
                  onChangeText={setScheduledAt}
                  helper="ISO 8601"
                  autoCapitalize="none"
                />
                <Button
                  title={t('delivery.pickup')}
                  variant="secondary"
                  loading={busy}
                  onPress={() => performAction('pickup')}
                />
                <OptionPicker
                  label={t('delivery.shipmentStatus')}
                  options={SHIPMENT_STATUSES.map((value) => ({ value, label: value }))}
                  value={status}
                  onChange={setStatus}
                />
                <Button
                  title={t('delivery.updateStatus')}
                  loading={busy}
                  onPress={() => performAction('status')}
                />
                <OptionPicker
                  label={t('delivery.selectDelivery')}
                  options={deliveryList.map((delivery) => ({
                    value: delivery.id,
                    label: `${delivery.phase || 'DELIVERY'} · ${delivery.status || '—'}`,
                  }))}
                  value={deliveryId}
                  onChange={setDeliveryId}
                  placeholder={t('delivery.noDeliveries')}
                />
                <TextField
                  label={t('delivery.proofUrl')}
                  value={proofUrl}
                  onChangeText={setProofUrl}
                  placeholder="https://…"
                  autoCapitalize="none"
                />
                <Button
                  title={t('delivery.proof')}
                  variant="secondary"
                  loading={busy}
                  onPress={() => performAction('proof')}
                />
                {deliveries.error ? <ErrorState message={deliveries.error.message} /> : null}
                {actionError ? <ErrorState message={actionError.message} /> : null}
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}
