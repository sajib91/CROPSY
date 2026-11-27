'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  BarChart,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartCard,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LineChart,
  LoadingState,
  Select,
} from '../ui';
import { useAuth } from '../auth/auth-provider';
import { getFarmerProfile, getUserProfile, updateUserProfile } from '@/lib/auth/client';
import { dashboardPost } from '@/lib/dashboard/client';
import {
  displayObject,
  filterRows,
  formatDate,
  formatDateTime,
  formatDecimal,
  formatMoney,
  formatMoneyByCurrency,
  formatNumber,
  groupByLabel,
  localizedText,
  uniqueOptions,
} from '@/lib/dashboard/format';
import {
  DataTable,
  EmptyPanel,
  FilterBar,
  FilterInput,
  FilterSelect,
  InfoGrid,
  ItemList,
  QueryPanel,
  RecordPairs,
  SectionHeader,
  useDashboardQuery,
} from './dashboard-primitives';

function FarmRequired({ labels }) {
  return <EmptyState title={labels.noFarmTitle} description={labels.noFarmLead} />;
}

export function InventorySection({ locale, labels, user }) {
  const listings = useDashboardQuery('/marketplace/listings', {
    sellerUserId: user?.id,
    limit: 100,
    sort: 'newest',
  });
  const rows = listings.data?.listings || [];
  const statusChart = groupByLabel(
    rows,
    (row) => row.status || labels.notProvided,
    () => 1,
  );

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.inventory}
        lead={labels.inventory.lead}
        source={labels.source}
      />
      <div className="rounded-card border border-info-border bg-info-bg p-4 text-body-sm text-content">
        {labels.inventory.notice}
      </div>
      <QueryPanel query={listings} labels={labels.common}>
        <InfoGrid
          columns="sm:grid-cols-2"
          items={statusChart.map((item) => ({
            label: item.label,
            value: formatNumber(item.value, locale),
          }))}
        />
        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{labels.inventory.availabilityTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                caption={labels.inventory.availabilityTitle}
                labels={labels.common}
                columns={[
                  {
                    id: 'title',
                    label: labels.common.name,
                    render: (row) => localizedText(row.product, 'name', locale) || row.title || '—',
                  },
                  {
                    id: 'sku',
                    label: labels.common.code,
                    render: (row) => row.product?.sku || '—',
                  },
                  { id: 'status', label: labels.common.status, render: (row) => row.status || '—' },
                  {
                    id: 'quantity',
                    label: labels.inventory.availableQuantity,
                    render: (row) => formatDecimal(row.quantityAvailable, locale),
                  },
                  {
                    id: 'unit',
                    label: labels.common.unit,
                    render: (row) => row.product?.unitCode || '—',
                  },
                  {
                    id: 'price',
                    label: labels.listings.unitPrice,
                    render: (row) => formatMoney(row.unitPrice, row.currency, locale),
                  },
                  {
                    id: 'location',
                    label: labels.listings.location,
                    render: (row) => row.availableLocation || '—',
                  },
                ]}
                rows={rows}
              />
            </CardContent>
          </Card>
        </div>
      </QueryPanel>
    </div>
  );
}

export function ListingsSection({ locale, labels, user }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const listings = useDashboardQuery('/marketplace/listings', {
    sellerUserId: user?.id,
    limit: 100,
    sort: 'newest',
  });
  const rows = filterRows(listings.data?.listings, (row) => {
    if (status && row.status !== status) return false;
    if (!search) return true;
    const haystack = `${row.title || ''} ${localizedText(row.product, 'name', locale) || ''} ${
      row.product?.sku || ''
    }`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.listings}
        lead={labels.listings.lead}
        source={labels.source}
      />
      <FilterBar title={labels.sections.listings}>
        <FilterInput
          id="listing-search"
          label={labels.common.search}
          value={search}
          onChange={setSearch}
          placeholder={labels.common.name}
        />
        <FilterSelect
          id="listing-status"
          label={labels.common.status}
          value={status}
          onChange={setStatus}
          allLabel={labels.common.all}
          options={uniqueOptions(listings.data?.listings, (row) => row.status)}
        />
      </FilterBar>
      <QueryPanel query={listings} labels={labels.common}>
        <DataTable
          caption={labels.sections.listings}
          labels={labels.common}
          columns={[
            {
              id: 'title',
              label: labels.common.name,
              render: (row) => localizedText(row.product, 'name', locale) || row.title || '—',
            },
            { id: 'sku', label: labels.common.code, render: (row) => row.product?.sku || '—' },
            {
              id: 'status',
              label: labels.common.status,
              render: (row) => <Badge tone="info">{row.status || '—'}</Badge>,
            },
            {
              id: 'price',
              label: labels.listings.unitPrice,
              render: (row) => formatMoney(row.unitPrice, row.currency, locale),
            },
            {
              id: 'available',
              label: labels.listings.available,
              render: (row) => formatDecimal(row.quantityAvailable, locale),
            },
            {
              id: 'minOrder',
              label: labels.listings.minOrder,
              render: (row) => formatDecimal(row.minOrderQuantity, locale),
            },
            {
              id: 'harvest',
              label: labels.listings.harvestDate,
              render: (row) => formatDate(row.harvestDate, locale),
            },
          ]}
          rows={rows}
        />
      </QueryPanel>
    </div>
  );
}

export function OrdersSection({ locale, labels }) {
  const [status, setStatus] = useState('');
  const orders = useDashboardQuery('/orders/orders', { limit: 100 });
  const filtered = filterRows(orders.data?.orders, (row) => !status || row.status === status);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.orders}
        lead={labels.orders.lead}
        source={labels.source}
      />
      <FilterBar title={labels.sections.orders}>
        <FilterSelect
          id="order-status"
          label={labels.common.status}
          value={status}
          onChange={setStatus}
          allLabel={labels.common.all}
          options={uniqueOptions(orders.data?.orders, (row) => row.status)}
        />
      </FilterBar>
      <QueryPanel query={orders} labels={labels.common}>
        <DataTable
          caption={labels.sections.orders}
          labels={labels.common}
          columns={[
            { id: 'id', label: labels.common.id, render: (row) => row.id },
            {
              id: 'status',
              label: labels.common.status,
              render: (row) => <Badge tone="info">{row.status || '—'}</Badge>,
            },
            {
              id: 'total',
              label: labels.orders.total,
              render: (row) => formatMoney(row.totalAmount, row.currency, locale),
            },
            {
              id: 'items',
              label: labels.orders.items,
              render: (row) => formatNumber((row.items || []).length, locale),
            },
            {
              id: 'placed',
              label: labels.orders.placedAt,
              render: (row) => formatDate(row.placedAt, locale),
            },
            {
              id: 'buyer',
              label: labels.orders.buyer,
              render: (row) => row.buyerUserId || '—',
            },
            {
              id: 'seller',
              label: labels.orders.seller,
              render: (row) => row.sellerUserId || '—',
            },
          ]}
          rows={filtered}
        />
      </QueryPanel>
    </div>
  );
}

export function EarningsSection({ locale, labels }) {
  const [status, setStatus] = useState('');
  const earnings = useDashboardQuery('/farmers/earnings/me');
  const rows = filterRows(earnings.data?.earnings, (row) => !status || row.status === status);
  const totals = formatMoneyByCurrency(rows, 'amount', locale);
  const statusChart = groupByLabel(
    rows,
    (row) => row.status || labels.notProvided,
    () => 1,
  );

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.earnings}
        lead={labels.earnings.lead}
        source={labels.source}
      />
      <FilterBar title={labels.sections.earnings}>
        <FilterSelect
          id="earnings-status"
          label={labels.common.status}
          value={status}
          onChange={setStatus}
          allLabel={labels.common.all}
          options={uniqueOptions(earnings.data?.earnings, (row) => row.status)}
        />
      </FilterBar>
      <QueryPanel query={earnings} labels={labels.common}>
        <InfoGrid
          columns="sm:grid-cols-2"
          items={totals.map((total) => ({
            label: `${labels.earnings.total} · ${total.currency || labels.common.notProvided}`,
            value: total.label,
          }))}
        />
        <div className="mt-6">
          <ChartCard title={labels.common.status}>
            <BarChart
              label={labels.common.status}
              data={statusChart}
              tone="success"
              valueFormatter={(value) => formatNumber(value, locale)}
            />
          </ChartCard>
        </div>
        <div className="mt-6">
          <DataTable
            caption={labels.sections.earnings}
            labels={labels.common}
            columns={[
              { id: 'id', label: labels.common.id, render: (row) => row.id },
              { id: 'status', label: labels.common.status, render: (row) => row.status || '—' },
              {
                id: 'amount',
                label: labels.common.amount,
                render: (row) => formatMoney(row.amount, row.currency, locale),
              },
              {
                id: 'policy',
                label: labels.earnings.policy,
                render: (row) => row.policyCode || '—',
              },
              { id: 'group', label: labels.earnings.group, render: (row) => row.groupId || '—' },
              {
                id: 'campaign',
                label: labels.earnings.campaign,
                render: (row) => row.campaignId || '—',
              },
              {
                id: 'created',
                label: labels.common.date,
                render: (row) => formatDate(row.createdAt, locale),
              },
            ]}
            rows={rows}
          />
        </div>
      </QueryPanel>
    </div>
  );
}

export function MarketSection({ locale, labels }) {
  const [cropId, setCropId] = useState('');
  const [region, setRegion] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const products = useDashboardQuery('/catalog/products', { includeGlobal: true });

  useEffect(() => {
    if (!cropId && products.data?.products?.length) {
      setCropId(products.data.products[0].id);
    }
  }, [cropId, products.data]);

  const params = { productId: cropId, region, from, to };
  const observations = useDashboardQuery('/market-intelligence/observations', params, {
    enabled: Boolean(cropId),
  });
  const trends = useDashboardQuery(
    '/market-intelligence/trends',
    { ...params, granularity: 'observation' },
    {
      enabled: Boolean(cropId),
    },
  );

  const chartData = (trends.data?.chart?.series || []).map((point) => ({
    label: point.x || '—',
    value: Number(point.y) || 0,
  }));
  const summary = observations.data?.summary;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.market}
        lead={labels.market.lead}
        source={labels.source}
      />
      <FilterBar title={labels.sections.market}>
        <FilterSelect
          id="market-product"
          label={labels.market.selectProduct}
          value={cropId}
          onChange={setCropId}
          allLabel={labels.market.selectProduct}
          options={(products.data?.products || []).map((product) => ({
            value: product.id,
            label: localizedText(product, 'name', locale) || product.sku || product.id,
          }))}
        />
        <FilterInput
          id="market-region"
          label={labels.common.region}
          value={region}
          onChange={setRegion}
        />
        <FilterInput
          id="market-from"
          label={labels.common.from}
          type="date"
          value={from}
          onChange={setFrom}
        />
        <FilterInput
          id="market-to"
          label={labels.common.to}
          type="date"
          value={to}
          onChange={setTo}
        />
      </FilterBar>

      {!cropId ? <EmptyPanel labels={labels.common} title={labels.market.noProduct} /> : null}

      <QueryPanel query={observations} labels={labels.common}>
        <InfoGrid
          columns="sm:grid-cols-2 xl:grid-cols-5"
          items={[
            { label: labels.market.count, value: formatNumber(summary?.count, locale) },
            { label: labels.market.currency, value: summary?.currency || labels.notProvided },
            { label: labels.market.min, value: formatDecimal(summary?.min, locale) },
            { label: labels.market.max, value: formatDecimal(summary?.max, locale) },
            { label: labels.market.median, value: formatDecimal(summary?.median, locale) },
          ]}
        />
        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{labels.market.quality}</CardTitle>
            </CardHeader>
            <CardContent>
              <RecordPairs record={observations.data?.dataQuality} labels={labels.market} />
            </CardContent>
          </Card>
        </div>
        <div className="mt-6">
          <ChartCard title={labels.market.trendTitle}>
            <LineChart
              label={labels.market.trendTitle}
              data={chartData}
              valueFormatter={(value) => formatDecimal(value, locale)}
            />
          </ChartCard>
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{labels.market.observations}</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                caption={labels.market.observations}
                labels={labels.common}
                columns={[
                  {
                    id: 'time',
                    label: labels.common.date,
                    render: (row) => formatDateTime(row.observedAt, locale),
                  },
                  {
                    id: 'price',
                    label: labels.listings.unitPrice,
                    render: (row) => formatMoney(row.price, row.currency, locale),
                  },
                  { id: 'region', label: labels.common.region, render: (row) => row.region || '—' },
                  {
                    id: 'evidence',
                    label: labels.market.evidenceClass,
                    render: (row) => row.evidenceClass || '—',
                  },
                  {
                    id: 'source',
                    label: labels.market.sources,
                    render: (row) => row.source || '—',
                  },
                ]}
                rows={observations.data?.observations || []}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{labels.market.evidence}</CardTitle>
            </CardHeader>
            <CardContent>
              <RecordPairs record={observations.data?.externalEvidence} labels={labels.market} />
              {observations.data?.advisory ? (
                <p className="mt-4 text-body-sm text-content-muted">{observations.data.advisory}</p>
              ) : null}
              {observations.data?.limitations?.length ? (
                <div className="mt-4">
                  <h4 className="text-body-sm font-semibold">{labels.market.limitations}</h4>
                  <ItemList
                    items={observations.data.limitations.map((item, index) => ({
                      id: index,
                      value: item,
                    }))}
                    labels={labels.market}
                    title={labels.market.limitations}
                    renderItem={(item) => <span>{displayObject(item.value)}</span>}
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </QueryPanel>
    </div>
  );
}

export function WeatherSection({ locale, labels, selectedFarmId }) {
  const [state, setState] = useState({ status: 'idle', data: null, error: null });

  const load = useCallback(async () => {
    if (!selectedFarmId) return;
    setState({ status: 'loading', data: null, error: null });
    try {
      const data = await dashboardPost('/intelligence/ai/weather/advisory', {
        farmId: selectedFarmId,
        language: locale === 'bn' ? 'bn' : 'en',
        includeHistory: true,
        includeForecast: true,
        includeAlerts: true,
      });
      setState({ status: 'success', data, error: null });
    } catch (error) {
      setState({ status: 'error', data: null, error });
    }
  }, [locale, selectedFarmId]);

  if (!selectedFarmId) return <FarmRequired labels={labels} />;

  const data = state.data;
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.weather}
        lead={labels.weather.lead}
        source={labels.source}
        actions={
          <Button
            onClick={load}
            loading={state.status === 'loading'}
            loadingText={labels.weather.loading}
          >
            {labels.weather.load}
          </Button>
        }
      />
      {state.status === 'idle' ? (
        <EmptyPanel labels={labels.common} title={labels.weather.selectFarm} />
      ) : null}
      {state.status === 'error' ? (
        <ErrorState
          title={labels.weather.noProvider}
          description={state.error?.message}
          retryLabel={labels.common.retry}
          onRetry={load}
        />
      ) : null}
      {state.status === 'loading' ? <LoadingState label={labels.weather.loading} /> : null}
      {state.status === 'success' && data ? (
        <div className="flex flex-col gap-6">
          <InfoGrid
            columns="sm:grid-cols-3"
            items={[
              { label: labels.weather.provider, value: data.provider || labels.notProvided },
              {
                label: labels.weather.generatedAt,
                value: formatDateTime(data.generatedAt, locale),
              },
              { label: labels.weather.location, value: displayObject(data.location) },
            ]}
          />
          {data.advisory ? (
            <Card>
              <CardHeader>
                <CardTitle>{labels.weather.advisory}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-body-sm text-content">{data.advisory}</p>
              </CardContent>
            </Card>
          ) : null}
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{labels.weather.observations}</CardTitle>
              </CardHeader>
              <CardContent>
                <ItemList
                  items={data.observations || []}
                  labels={labels.weather}
                  title={labels.weather.observations}
                  renderItem={(item) => <RecordPairs record={item} labels={labels.weather} />}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{labels.weather.forecasts}</CardTitle>
              </CardHeader>
              <CardContent>
                <ItemList
                  items={data.forecasts || []}
                  labels={labels.weather}
                  title={labels.weather.forecasts}
                  renderItem={(item) => <RecordPairs record={item} labels={labels.weather} />}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{labels.weather.alerts}</CardTitle>
              </CardHeader>
              <CardContent>
                <ItemList
                  items={data.alerts || []}
                  labels={labels.weather}
                  title={labels.weather.alerts}
                  renderItem={(item) => <RecordPairs record={item} labels={labels.weather} />}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{labels.weather.risk}</CardTitle>
              </CardHeader>
              <CardContent>
                <ItemList
                  items={data.riskNotifications || []}
                  labels={labels.weather}
                  title={labels.weather.risk}
                  renderItem={(item) => <RecordPairs record={item} labels={labels.weather} />}
                />
              </CardContent>
            </Card>
          </div>
          {data.recommendations?.length ? (
            <Card>
              <CardHeader>
                <CardTitle>{labels.weather.recommendations}</CardTitle>
              </CardHeader>
              <CardContent>
                <ItemList
                  items={data.recommendations}
                  labels={labels.weather}
                  title={labels.weather.recommendations}
                  renderItem={(item) => <RecordPairs record={item} labels={labels.weather} />}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AssistantSection({ locale, labels }) {
  const [question, setQuestion] = useState('');
  const [state, setState] = useState({ status: 'idle', data: null, error: null });
  const capabilities = useDashboardQuery('/intelligence/ai/capabilities');

  const ask = useCallback(async () => {
    if (!question.trim()) return;
    setState({ status: 'loading', data: null, error: null });
    try {
      const data = await dashboardPost('/intelligence/ai/ask', {
        question: question.trim(),
        language: locale === 'bn' ? 'bn' : 'en',
      });
      setState({ status: 'success', data, error: null });
    } catch (error) {
      setState({ status: 'error', data: null, error });
    }
  }, [locale, question]);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.assistant}
        lead={labels.assistant.lead}
        source={labels.source}
      />
      <Card>
        <CardHeader>
          <CardTitle>{labels.sections.assistant}</CardTitle>
          <CardDescription>{labels.assistant.example}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label={labels.assistant.question}>
            <Input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={labels.assistant.placeholder}
            />
          </Field>
          <div>
            <Button
              onClick={ask}
              loading={state.status === 'loading'}
              loadingText={labels.assistant.sending}
            >
              {labels.assistant.send}
            </Button>
          </div>
          {state.status === 'error' ? (
            <ErrorState
              title={labels.assistant.askError}
              description={state.error?.message}
              retryLabel={labels.common.retry}
              onRetry={ask}
            />
          ) : null}
          {state.status === 'loading' ? <LoadingState label={labels.assistant.sending} /> : null}
          {state.status === 'success' && state.data ? (
            <div className="flex flex-col gap-5">
              <Card>
                <CardHeader>
                  <CardTitle>{labels.assistant.answer}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-body-sm text-content">
                    {state.data.answer || labels.assistant.noAnswer}
                  </p>
                </CardContent>
              </Card>
              {state.data.advisory ? (
                <p className="rounded-control border border-info-border bg-info-bg p-4 text-body-sm">
                  {labels.assistant.advisory}: {state.data.advisory}
                </p>
              ) : null}
              <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>{labels.assistant.citations}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ItemList
                      items={state.data.citations || []}
                      labels={labels.assistant}
                      title={labels.assistant.citations}
                      renderItem={(item) => <RecordPairs record={item} labels={labels.assistant} />}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>{labels.assistant.limitations}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ItemList
                      items={(state.data.limitations || []).map((item, index) => ({
                        id: index,
                        value: item,
                      }))}
                      labels={labels.assistant}
                      title={labels.assistant.limitations}
                      renderItem={(item) => <span>{displayObject(item.value)}</span>}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.assistant.capabilities}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryPanel query={capabilities} labels={labels.common}>
            <RecordPairs record={capabilities.data?.assistant} labels={labels.assistant} />
          </QueryPanel>
        </CardContent>
      </Card>
    </div>
  );
}

export function NotificationsSection({ labels }) {
  const info = useDashboardQuery('/notifications/info');

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.notifications}
        lead={labels.notifications.lead}
        source={labels.source}
      />
      <div className="rounded-card border border-warning-border bg-warning-bg p-4 text-body-sm text-content">
        {labels.notifications.noFeed}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{labels.notifications.module}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryPanel query={info} labels={labels.common}>
            <RecordPairs record={info.data} labels={labels.notifications} />
          </QueryPanel>
        </CardContent>
      </Card>
    </div>
  );
}

export function SettingsSection({ locale, labels }) {
  const { session } = useAuth();
  const [state, setState] = useState({
    status: 'loading',
    profile: null,
    farmerProfile: null,
    error: null,
  });
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setState((current) => ({ ...current, status: 'loading', error: null }));
    try {
      const [profileResult, farmerResult] = await Promise.allSettled([
        getUserProfile(),
        getFarmerProfile(),
      ]);
      if (profileResult.status === 'rejected') throw profileResult.reason;
      const profile = profileResult.value;
      const farmerProfile = farmerResult.status === 'fulfilled' ? farmerResult.value : null;
      setState({ status: 'success', profile, farmerProfile, error: null });
      setForm({
        firstName: profile?.firstName || '',
        lastName: profile?.lastName || '',
        nameBn: profile?.nameBn || '',
        preferredLanguage: profile?.preferredLanguage || '',
        defaultCurrency: profile?.defaultCurrency || '',
      });
    } catch (error) {
      setState({ status: 'error', profile: null, farmerProfile: null, error });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (event) => {
      event.preventDefault();
      setSaving(true);
      setMessage('');
      try {
        await updateUserProfile(form);
        await load();
        setMessage(labels.common.saved);
      } catch (error) {
        setMessage(error?.message || labels.errorTitle);
      } finally {
        setSaving(false);
      }
    },
    [form, labels.common.saved, labels.errorTitle, load],
  );

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.settings}
        lead={labels.settings.lead}
        source={labels.source}
      />
      {state.status === 'loading' ? <LoadingState label={labels.common.loading} /> : null}
      {state.status === 'error' ? (
        <ErrorState
          title={labels.errorTitle}
          description={state.error?.message}
          retryLabel={labels.common.retry}
          onRetry={load}
        />
      ) : null}
      {state.status === 'success' ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{labels.settings.profile}</CardTitle>
            </CardHeader>
            <CardContent>
              <RecordPairs
                record={{
                  email: state.profile?.email,
                  phone: state.profile?.phone,
                  firstName: state.profile?.firstName,
                  lastName: state.profile?.lastName,
                  nameBn: state.profile?.nameBn,
                  preferredLanguage: state.profile?.preferredLanguage,
                  defaultCurrency: state.profile?.defaultCurrency,
                  verificationStatus: state.profile?.verificationStatus,
                  emailVerified: state.profile?.isEmailVerified
                    ? labels.settings.verified
                    : labels.settings.notVerified,
                  phoneVerified: state.profile?.isPhoneVerified
                    ? labels.settings.verified
                    : labels.settings.notVerified,
                }}
                labels={{ ...labels.settings, ...labels.common }}
              />
              <div className="mt-4">
                <h4 className="mb-2 text-body-sm font-semibold">{labels.settings.roles}</h4>
                <div className="flex flex-wrap gap-2">
                  {(state.profile?.roleCodes || []).map((role) => (
                    <Badge key={role} tone="brand">
                      {role}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <h4 className="mb-2 text-body-sm font-semibold">{labels.settings.organizations}</h4>
                <ItemList
                  items={state.profile?.organizations || []}
                  labels={labels.common}
                  title={labels.settings.organizations}
                  renderItem={(org) => (
                    <span>
                      {org.name || org.id} · {(org.roleCodes || []).join(', ')}
                    </span>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{labels.settings.farmerProfile}</CardTitle>
            </CardHeader>
            <CardContent>
              <RecordPairs
                record={{
                  farmerCode: state.farmerProfile?.farmerCode,
                  organizationId: state.farmerProfile?.organizationId,
                  verificationStatus: state.farmerProfile?.verificationStatus,
                  farmSizeHectares: state.farmerProfile?.farmSizeHectares,
                  experienceYears: state.farmerProfile?.experienceYears,
                  primaryCropId: state.farmerProfile?.primaryCropId,
                  storage: state.farmerProfile?.storage,
                  updatedAt: state.farmerProfile?.updatedAt
                    ? formatDate(state.farmerProfile.updatedAt, locale)
                    : null,
                }}
                labels={labels.settings}
              />
              <div className="mt-4">
                <h4 className="mb-2 text-body-sm font-semibold">{labels.settings.session}</h4>
                <RecordPairs
                  record={{
                    id: session?.session?.id,
                    expiresAt: session?.session?.expiresAt
                      ? formatDateTime(session.session.expiresAt, locale)
                      : null,
                    lastSeenAt: session?.session?.lastSeenAt
                      ? formatDateTime(session.session.lastSeenAt, locale)
                      : null,
                  }}
                  labels={labels.settings}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>{labels.settings.editProfile}</CardTitle>
              <CardDescription>{labels.source}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Field label={labels.settings.firstName}>
                  <Input
                    value={form.firstName || ''}
                    onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                  />
                </Field>
                <Field label={labels.settings.lastName}>
                  <Input
                    value={form.lastName || ''}
                    onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                  />
                </Field>
                <Field label={labels.settings.nameBn}>
                  <Input
                    value={form.nameBn || ''}
                    onChange={(event) => setForm({ ...form, nameBn: event.target.value })}
                  />
                </Field>
                <Field label={labels.settings.preferredLanguage}>
                  <Select
                    value={form.preferredLanguage || ''}
                    onChange={(event) =>
                      setForm({ ...form, preferredLanguage: event.target.value })
                    }
                    options={['EN', 'BN']}
                  />
                </Field>
                <Field label={labels.settings.defaultCurrency}>
                  <Input
                    value={form.defaultCurrency || ''}
                    onChange={(event) => setForm({ ...form, defaultCurrency: event.target.value })}
                  />
                </Field>
                <div className="flex items-end">
                  <Button type="submit" loading={saving} loadingText={labels.common.saving}>
                    {labels.common.save}
                  </Button>
                </div>
                {message ? (
                  <p className="text-body-sm text-content-muted sm:col-span-2 xl:col-span-3">
                    {message}
                  </p>
                ) : null}
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
