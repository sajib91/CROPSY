'use client';

import { useState } from 'react';
import {
  Badge,
  BarChart,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartCard,
  DonutChart,
  EmptyState,
  ErrorState,
  LoadingState,
} from '../ui';
import { ActivityFeed, DashboardGrid, QuickActions, StatCard } from '../ui/dashboard-widgets';
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
import { FarmMap } from './farm-map';
import {
  filterRows,
  formatDate,
  formatDecimal,
  formatMoney,
  formatMoneyByCurrency,
  formatNumber,
  groupByLabel,
  localizedText,
  sumNumbers,
  uniqueOptions,
} from '@/lib/dashboard/format';

function summaryMoney(groups, labels) {
  if (groups.length === 0) return labels.notProvided;
  return groups.map((group) => group.label).join(' · ');
}

function farmName(farms, farmId, locale) {
  const farm = farms.find((item) => item.id === farmId);
  return farm ? localizedText(farm, 'name', locale) : farmId || '';
}

function FarmRequired({ labels }) {
  return <EmptyState title={labels.noFarmTitle} description={labels.noFarmLead} />;
}

export function OverviewSection({ locale, labels, farms, selectedFarmId }) {
  const cultivations = useDashboardQuery('/agriculture/cultivations', {
    farmId: selectedFarmId,
  });
  const activities = useDashboardQuery(
    selectedFarmId
      ? `/agriculture/farms/${selectedFarmId}/activities`
      : '/agriculture/farms/none/activities',
    {},
    { enabled: Boolean(selectedFarmId) },
  );
  const expenses = useDashboardQuery('/agriculture/expenses', { farmId: selectedFarmId });
  const harvests = useDashboardQuery(
    selectedFarmId
      ? `/agriculture/farms/${selectedFarmId}/harvests`
      : '/agriculture/farms/none/harvests',
    {},
    { enabled: Boolean(selectedFarmId) },
  );
  const listings = useDashboardQuery('/marketplace/listings', { limit: 100, sort: 'newest' });
  const orders = useDashboardQuery('/orders/orders', { limit: 100 });
  const earnings = useDashboardQuery('/farmers/earnings/me');

  if (farms.status === 'error') {
    return (
      <ErrorState
        title={labels.errorTitle}
        description={farms.error?.message}
        retryLabel={labels.retry}
        onRetry={farms.reload}
      />
    );
  }
  if (farms.status === 'loading') return <LoadingState label={labels.loading} />;
  if (farms.status !== 'success' || farms.data?.farms?.length === 0) {
    return <FarmRequired labels={labels} />;
  }

  const farmRows = farms.data.farms || [];
  const cultivationRows = cultivations.data?.cultivations || [];
  const activityRows = activities.data?.activities || [];
  const expenseRows = expenses.data?.expenses || [];
  const harvestRows = harvests.data?.harvests || [];
  const listingRows = listings.data?.listings || [];
  const orderRows = orders.data?.orders || [];
  const earningRows = earnings.data?.earnings || [];

  const area = sumNumbers(farmRows, (farm) => farm.area?.hectares);
  const harvestKg = sumNumbers(harvestRows, (row) => row.quantityKg);
  const expenseTotals = formatMoneyByCurrency(expenseRows, 'amount', locale);
  const earningTotals = formatMoneyByCurrency(earningRows, 'amount', locale);
  const expenseChart = groupByLabel(
    expenseRows,
    (row) => row.category,
    (row) => row.amount,
  );
  const harvestChart = groupByLabel(
    harvestRows,
    (row) =>
      farmName(cultivationRows, row.cultivationId, locale) ||
      row.cultivationId ||
      labels.notProvided,
    (row) => row.quantityKg,
  );

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.overview}
        lead={labels.overview.lead}
        source={labels.source}
      />

      <DashboardGrid>
        <StatCard label={labels.overview.farms} value={formatNumber(farmRows.length, locale)} />
        <StatCard label={labels.overview.area} value={formatDecimal(area, locale)} />
        <StatCard
          label={labels.overview.cultivations}
          value={formatNumber(cultivationRows.length, locale)}
        />
        <StatCard label={labels.overview.harvestKg} value={formatDecimal(harvestKg, locale)} />
        <StatCard
          label={labels.overview.expenses}
          value={summaryMoney(expenseTotals, labels.common)}
          helper={expenseTotals.length > 1 ? labels.common.mixedCurrency : undefined}
        />
        <StatCard
          label={labels.overview.listings}
          value={formatNumber(listingRows.length, locale)}
        />
        <StatCard label={labels.overview.orders} value={formatNumber(orderRows.length, locale)} />
        <StatCard
          label={labels.overview.earnings}
          value={summaryMoney(earningTotals, labels.common)}
          helper={earningTotals.length > 1 ? labels.common.mixedCurrency : undefined}
        />
      </DashboardGrid>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title={labels.overview.expensesTitle}>
          <BarChart
            label={labels.overview.expensesTitle}
            data={expenseChart}
            tone="warning"
            valueFormatter={(value) => formatDecimal(value, locale)}
          />
        </ChartCard>
        <ChartCard title={labels.overview.harvestTitle}>
          <DonutChart
            label={labels.overview.harvestTitle}
            data={harvestChart}
            centerLabel={labels.overview.harvestKg}
            valueFormatter={(value) => formatDecimal(value, locale)}
          />
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <QueryPanel query={activities} labels={labels.common} title={labels.overview.activityTitle}>
          <ActivityFeed
            title={labels.overview.activityTitle}
            items={activityRows.map((item) => ({
              id: item.id,
              title: item.activityType || labels.common.type,
              time: formatDate(item.activityDate, locale),
              description: item.notes || item.growthStage,
            }))}
          />
        </QueryPanel>
        <QuickActions
          title={labels.overview.actionsTitle}
          actions={[
            { href: `#farms`, label: labels.sections.farms },
            { href: `#land`, label: labels.sections.land },
            { href: `#expenses`, label: labels.sections.expenses },
            { href: `#market`, label: labels.sections.market },
          ].map((action) => ({
            ...action,
            description: labels.source,
          }))}
        />
      </div>
    </div>
  );
}

export function FarmsSection({ locale, labels, farms, onSelectFarm }) {
  const map = useDashboardQuery('/farmers/farms/map', { includeArchived: false });

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.farms}
        lead={labels.farms.lead}
        source={labels.source}
      />
      <QueryPanel query={farms} labels={labels.common}>
        <Card>
          <CardHeader>
            <CardTitle>{labels.farms.tableTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              caption={labels.farms.tableTitle}
              labels={labels.common}
              columns={[
                {
                  id: 'name',
                  label: labels.common.name,
                  render: (farm) => (
                    <button
                      type="button"
                      onClick={() => onSelectFarm(farm.id)}
                      className="text-left font-semibold text-brand-700 hover:underline dark:text-brand-300"
                    >
                      {localizedText(farm, 'name', locale)}
                    </button>
                  ),
                },
                { id: 'code', label: labels.common.code, render: (farm) => farm.code || '—' },
                {
                  id: 'type',
                  label: labels.farms.farmType,
                  render: (farm) => farm.farmType || '—',
                },
                {
                  id: 'status',
                  label: labels.common.status,
                  render: (farm) => <Badge tone="info">{farm.status || '—'}</Badge>,
                },
                {
                  id: 'area',
                  label: labels.farms.area,
                  render: (farm) => formatDecimal(farm.area?.hectares, locale),
                },
                {
                  id: 'ownership',
                  label: labels.farms.ownership,
                  render: (farm) => farm.ownershipType || '—',
                },
                {
                  id: 'location',
                  label: labels.farms.location,
                  render: (farm) =>
                    localizedText(farm.location?.district, 'name', locale) ||
                    farm.location?.addressLine ||
                    '—',
                },
              ]}
              rows={farms.data?.farms || []}
            />
          </CardContent>
        </Card>
      </QueryPanel>

      <Card>
        <CardHeader>
          <CardTitle>{labels.farms.mapTitle}</CardTitle>
          <CardDescription>{labels.farms.mapLead}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryPanel query={map} labels={labels.common}>
            <FarmMap
              features={map.data?.features || []}
              labels={labels.farms}
              title={labels.farms.mapTitle}
            />
          </QueryPanel>
        </CardContent>
      </Card>
    </div>
  );
}

export function LandSection({ locale, labels, selectedFarmId }) {
  const enabled = Boolean(selectedFarmId);
  const parcels = useDashboardQuery(
    `/farmers/farms/${selectedFarmId || 'none'}/parcels`,
    {},
    { enabled },
  );
  const soil = useDashboardQuery(
    `/farmers/farms/${selectedFarmId || 'none'}/soil`,
    {},
    { enabled },
  );
  const irrigations = useDashboardQuery(
    `/farmers/farms/${selectedFarmId || 'none'}/irrigations`,
    {},
    { enabled },
  );
  const coordinates = useDashboardQuery(
    `/farmers/farms/${selectedFarmId || 'none'}/coordinates`,
    {},
    { enabled },
  );

  if (!enabled) return <FarmRequired labels={labels} />;

  const coordinateData = coordinates.data;
  const geometry =
    coordinateData?.boundary || (coordinateData?.coordinates ? coordinateData.coordinates : null);
  const features = geometry
    ? [
        {
          id: selectedFarmId,
          geometry,
          properties: {
            name: selectedFarmId,
            geometryType: geometry.type,
          },
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title={labels.sections.land} lead={labels.land.lead} source={labels.source} />
      <Card>
        <CardHeader>
          <CardTitle>{labels.land.mapTitle}</CardTitle>
          <CardDescription>{labels.farms.mapLead}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryPanel query={coordinates} labels={labels.common}>
            <FarmMap features={features} labels={labels.farms} title={labels.land.mapTitle} />
          </QueryPanel>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.land.parcels}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryPanel query={parcels} labels={labels.common}>
            <DataTable
              caption={labels.land.parcels}
              labels={labels.common}
              emptyTitle={labels.land.noParcels}
              columns={[
                {
                  id: 'name',
                  label: labels.common.name,
                  render: (row) => localizedText(row, 'name', locale),
                },
                { id: 'code', label: labels.common.code, render: (row) => row.code || '—' },
                {
                  id: 'area',
                  label: labels.common.quantity,
                  render: (row) => formatDecimal(row.area?.hectares, locale),
                },
                {
                  id: 'ownership',
                  label: labels.land.ownership,
                  render: (row) => row.ownershipType || '—',
                },
                { id: 'status', label: labels.land.status, render: (row) => row.status || '—' },
                {
                  id: 'boundary',
                  label: labels.details || labels.common.details,
                  render: (row) => (row.hasBoundary ? row.boundary?.type || 'GeoJSON' : '—'),
                },
              ]}
              rows={parcels.data?.parcels || []}
            />
          </QueryPanel>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{labels.land.soil}</CardTitle>
          </CardHeader>
          <CardContent>
            <QueryPanel query={soil} labels={labels.common}>
              {soil.data ? (
                <RecordPairs
                  record={{
                    soilType: soil.data.soilType,
                    texture: soil.data.texture,
                    ph: soil.data.ph,
                    organicMatterPercent: soil.data.organicMatterPercent,
                    fertility: soil.data.fertility,
                    drainage: soil.data.drainage,
                    testedAt: soil.data.testedAt ? formatDate(soil.data.testedAt, locale) : null,
                    testingLab: soil.data.testingLab,
                    notes: soil.data.notes,
                  }}
                  labels={labels.land}
                />
              ) : (
                <EmptyPanel labels={labels.common} title={labels.land.noSoil} />
              )}
            </QueryPanel>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{labels.land.irrigation}</CardTitle>
          </CardHeader>
          <CardContent>
            <QueryPanel query={irrigations} labels={labels.common}>
              <DataTable
                caption={labels.land.irrigation}
                labels={labels.common}
                emptyTitle={labels.land.noIrrigation}
                columns={[
                  { id: 'code', label: labels.common.code, render: (row) => row.code || '—' },
                  { id: 'source', label: labels.land.source, render: (row) => row.source || '—' },
                  { id: 'method', label: labels.land.method, render: (row) => row.method || '—' },
                  { id: 'status', label: labels.common.status, render: (row) => row.status || '—' },
                  {
                    id: 'capacity',
                    label: labels.common.quantity,
                    render: (row) => formatDecimal(row.capacityLitersPerMinute, locale),
                  },
                  {
                    id: 'commandArea',
                    label: labels.land.commandArea,
                    render: (row) => formatDecimal(row.commandAreaHectares, locale),
                  },
                  {
                    id: 'frequency',
                    label: labels.land.frequency,
                    render: (row) => formatDecimal(row.frequencyPerWeek, locale),
                  },
                ]}
                rows={irrigations.data?.irrigations || []}
              />
            </QueryPanel>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function CropsSection({ locale, labels, selectedFarmId }) {
  const [status, setStatus] = useState('');
  const cultivations = useDashboardQuery('/agriculture/cultivations', {
    farmId: selectedFarmId,
    status,
  });
  const crops = useDashboardQuery('/agriculture/crops');
  const varieties = useDashboardQuery('/agriculture/varieties');

  const cropNames = new Map(
    (crops.data?.crops || []).map((crop) => [crop.id, localizedText(crop, 'name', locale)]),
  );
  const varietyNames = new Map(
    (varieties.data?.varieties || []).map((variety) => [
      variety.id,
      localizedText(variety, 'name', locale),
    ]),
  );
  const statusOptions = uniqueOptions(cultivations.data?.cultivations || [], (row) => row.status);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.crops}
        lead={labels.crops.lead}
        source={labels.source}
      />
      <FilterBar title={labels.sections.crops}>
        <FilterSelect
          id="crop-status"
          label={labels.common.status}
          value={status}
          onChange={setStatus}
          allLabel={labels.common.all}
          options={statusOptions}
        />
      </FilterBar>
      <Card>
        <CardHeader>
          <CardTitle>{labels.crops.tableTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryPanel query={cultivations} labels={labels.common}>
            <DataTable
              caption={labels.crops.tableTitle}
              labels={labels.common}
              columns={[
                { id: 'code', label: labels.common.code, render: (row) => row.code || '—' },
                {
                  id: 'farm',
                  label: labels.crops.farm,
                  render: (row) => row.farmId || '—',
                },
                {
                  id: 'crop',
                  label: labels.crops.crop,
                  render: (row) => cropNames.get(row.cropId) || row.cropId || '—',
                },
                {
                  id: 'variety',
                  label: labels.crops.variety,
                  render: (row) => varietyNames.get(row.cropVarietyId) || row.cropVarietyId || '—',
                },
                { id: 'status', label: labels.common.status, render: (row) => row.status || '—' },
                { id: 'stage', label: labels.crops.stage, render: (row) => row.growthStage || '—' },
                {
                  id: 'area',
                  label: labels.crops.area,
                  render: (row) => formatDecimal(row.areaHectares, locale),
                },
                {
                  id: 'yield',
                  label: labels.crops.expectedYield,
                  render: (row) => formatDecimal(row.expectedYieldKg, locale),
                },
                {
                  id: 'sown',
                  label: labels.crops.sownAt,
                  render: (row) => formatDate(row.sownAt, locale),
                },
              ]}
              rows={cultivations.data?.cultivations || []}
            />
          </QueryPanel>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{labels.crops.referenceTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <QueryPanel query={crops} labels={labels.common}>
              <ItemList
                items={crops.data?.crops || []}
                labels={labels.common}
                title={labels.crops.referenceTitle}
                renderItem={(crop) => (
                  <div className="flex items-center justify-between gap-3">
                    <span>{localizedText(crop, 'name', locale)}</span>
                    <span className="text-caption text-content-muted">{crop.code}</span>
                  </div>
                )}
              />
            </QueryPanel>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{labels.crops.varietyTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <QueryPanel query={varieties} labels={labels.common}>
              <ItemList
                items={varieties.data?.varieties || []}
                labels={labels.common}
                title={labels.crops.varietyTitle}
                renderItem={(variety) => (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{localizedText(variety, 'name', locale)}</span>
                    <span className="text-caption text-content-muted">
                      {variety.maturityDays != null
                        ? `${formatNumber(variety.maturityDays, locale)} ${labels.crops.maturityDays}`
                        : ''}
                    </span>
                  </div>
                )}
              />
            </QueryPanel>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function CalendarSection({ locale, labels }) {
  const [cropId, setCropId] = useState('');
  const calendars = useDashboardQuery('/agriculture/calendars', {
    includeGlobal: true,
    cropId,
  });
  const recommendations = useDashboardQuery('/agriculture/recommendations', {
    includeGlobal: true,
    cropId,
  });
  const crops = useDashboardQuery('/agriculture/crops');

  const cropNames = new Map(
    (crops.data?.crops || []).map((crop) => [crop.id, localizedText(crop, 'name', locale)]),
  );
  const monthLabel = (month) => {
    const index = Number(month) - 1;
    return labels.calendar.months[index] || String(month ?? labels.notProvided);
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.calendar}
        lead={labels.calendar.lead}
        source={labels.source}
      />
      <FilterBar title={labels.sections.calendar}>
        <FilterSelect
          id="calendar-crop"
          label={labels.common.product}
          value={cropId}
          onChange={setCropId}
          allLabel={labels.common.all}
          options={(crops.data?.crops || []).map((crop) => ({
            value: crop.id,
            label: localizedText(crop, 'name', locale),
          }))}
        />
      </FilterBar>

      <Card>
        <CardHeader>
          <CardTitle>{labels.sections.calendar}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryPanel query={calendars} labels={labels.common} title={labels.calendar.noCalendar}>
            <ItemList
              items={calendars.data?.calendars || []}
              labels={labels.common}
              title={labels.calendar.noCalendar}
              renderItem={(calendar) => (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{calendar.name || calendar.code}</p>
                    <Badge tone="neutral">
                      {calendar.isActive ? labels.active || 'Active' : '—'}
                    </Badge>
                  </div>
                  <p className="text-caption text-content-muted">
                    {labels.calendar.sowing}: {monthLabel(calendar.sowingStartMonth)} –{' '}
                    {monthLabel(calendar.sowingEndMonth)}
                  </p>
                  <p className="text-caption text-content-muted">
                    {labels.calendar.harvestDays}: {calendar.harvestDaysMin ?? '—'} –{' '}
                    {calendar.harvestDaysMax ?? '—'}
                  </p>
                  <p className="text-caption text-content-muted">
                    {labels.crops.crop}: {cropNames.get(calendar.cropId) || calendar.cropId || '—'}
                  </p>
                </div>
              )}
            />
          </QueryPanel>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.calendar.recommendations}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryPanel
            query={recommendations}
            labels={labels.common}
            title={labels.calendar.noRecommendation}
          >
            <ItemList
              items={recommendations.data?.recommendations || []}
              labels={labels.common}
              title={labels.calendar.noRecommendation}
              renderItem={(recommendation) => (
                <div className="flex flex-col gap-2">
                  <p className="font-semibold">{recommendation.title}</p>
                  <p className="text-content-muted">{recommendation.body}</p>
                  <p className="text-caption text-content-subtle">
                    {labels.calendar.source}: {recommendation.source || '—'} ·{' '}
                    {labels.calendar.confidence}: {recommendation.confidence ?? '—'} ·{' '}
                    {labels.calendar.validUntil}: {formatDate(recommendation.validUntil, locale)}
                  </p>
                </div>
              )}
            />
          </QueryPanel>
        </CardContent>
      </Card>
    </div>
  );
}

export function ActivitiesSection({ locale, labels, selectedFarmId }) {
  const [activityType, setActivityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const enabled = Boolean(selectedFarmId);
  const activities = useDashboardQuery(
    `/agriculture/farms/${selectedFarmId || 'none'}/activities`,
    {},
    { enabled },
  );

  if (!enabled) return <FarmRequired labels={labels} />;

  const rows = filterRows(activities.data?.activities, (row) => {
    if (activityType && row.activityType !== activityType) return false;
    const date = row.activityDate ? new Date(row.activityDate).getTime() : null;
    if (from && (date === null || date < new Date(from).getTime())) return false;
    if (to && (date === null || date > new Date(`${to}T23:59:59`).getTime())) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.activities}
        lead={labels.activities.lead}
        source={labels.source}
      />
      <FilterBar title={labels.sections.activities}>
        <FilterSelect
          id="activity-type"
          label={labels.activities.activityType}
          value={activityType}
          onChange={setActivityType}
          allLabel={labels.common.all}
          options={uniqueOptions(activities.data?.activities, (row) => row.activityType)}
        />
        <FilterInput
          id="activity-from"
          label={labels.common.from}
          type="date"
          value={from}
          onChange={setFrom}
        />
        <FilterInput
          id="activity-to"
          label={labels.common.to}
          type="date"
          value={to}
          onChange={setTo}
        />
      </FilterBar>
      <QueryPanel query={activities} labels={labels.common}>
        <DataTable
          caption={labels.sections.activities}
          labels={labels.common}
          columns={[
            {
              id: 'date',
              label: labels.activities.performedAt,
              render: (row) => formatDate(row.activityDate, locale),
            },
            { id: 'type', label: labels.common.type, render: (row) => row.activityType || '—' },
            {
              id: 'stage',
              label: labels.activities.stage,
              render: (row) => row.growthStage || '—',
            },
            {
              id: 'severity',
              label: labels.activities.severity,
              render: (row) => row.observationSeverity || '—',
            },
            {
              id: 'quantity',
              label: labels.common.quantity,
              render: (row) => formatDecimal(row.quantity, locale),
            },
            {
              id: 'unit',
              label: labels.common.unit,
              render: (row) => row.unitCode || '—',
            },
            {
              id: 'cost',
              label: labels.activities.cost,
              render: (row) => formatMoney(row.costAmount, row.currency, locale),
            },
            { id: 'notes', label: labels.common.notes, render: (row) => row.notes || '—' },
          ]}
          rows={rows}
        />
      </QueryPanel>
    </div>
  );
}

export function ExpensesSection({ locale, labels, selectedFarmId }) {
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const enabled = Boolean(selectedFarmId);
  const params = { farmId: selectedFarmId, category, from, to };
  const expenses = useDashboardQuery('/agriculture/expenses', params, { enabled });
  const report = useDashboardQuery(
    `/agriculture/farms/${selectedFarmId || 'none'}/reports/expenses`,
    params,
    { enabled },
  );
  const allExpenses = useDashboardQuery(
    '/agriculture/expenses',
    { farmId: selectedFarmId },
    { enabled },
  );

  if (!enabled) return <FarmRequired labels={labels} />;

  const reportData = report.data;
  const chartData = (reportData?.categoryBreakdown || []).map((row) => ({
    label: row.category || labels.notProvided,
    value: Number(row.recordedCost) || 0,
  }));

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.expenses}
        lead={labels.expenses.lead}
        source={labels.source}
      />
      <FilterBar title={labels.sections.expenses}>
        <FilterSelect
          id="expense-category"
          label={labels.common.category}
          value={category}
          onChange={setCategory}
          allLabel={labels.common.all}
          options={uniqueOptions(allExpenses.data?.expenses, (row) => row.category)}
        />
        <FilterInput
          id="expense-from"
          label={labels.common.from}
          type="date"
          value={from}
          onChange={setFrom}
        />
        <FilterInput
          id="expense-to"
          label={labels.common.to}
          type="date"
          value={to}
          onChange={setTo}
        />
      </FilterBar>

      <QueryPanel query={report} labels={labels.common}>
        <InfoGrid
          items={[
            {
              label: labels.expenses.recordedCost,
              value: formatMoney(reportData?.recordedCost, reportData?.currency, locale),
            },
            {
              label: labels.expenses.estimatedCost,
              value: formatMoney(reportData?.aiEstimatedCost, reportData?.currency, locale),
            },
            {
              label: labels.expenses.recordedCount,
              value: formatNumber(reportData?.recordedExpenseCount, locale),
            },
            {
              label: labels.expenses.estimatedCount,
              value: formatNumber(reportData?.aiEstimatedExpenseCount, locale),
            },
          ]}
        />
      </QueryPanel>

      <ChartCard
        title={labels.expenses.categoryBreakdown}
        description={
          reportData?.sourcePolicy
            ? `${labels.expenses.sourcePolicy}: ${reportData.sourcePolicy}`
            : undefined
        }
      >
        <BarChart
          label={labels.expenses.categoryBreakdown}
          data={chartData}
          tone="warning"
          valueFormatter={(value) => formatDecimal(value, locale)}
        />
      </ChartCard>

      <QueryPanel query={expenses} labels={labels.common}>
        <DataTable
          caption={labels.sections.expenses}
          labels={labels.common}
          columns={[
            {
              id: 'date',
              label: labels.expenses.expenseDate,
              render: (row) => formatDate(row.expenseDate, locale),
            },
            {
              id: 'category',
              label: labels.common.category,
              render: (row) => row.category || '—',
            },
            {
              id: 'description',
              label: labels.expenses.description,
              render: (row) => row.description || '—',
            },
            { id: 'source', label: labels.expenses.source, render: (row) => row.source || '—' },
            {
              id: 'amount',
              label: labels.common.amount,
              render: (row) => formatMoney(row.amount, row.currency, locale),
            },
            {
              id: 'confidence',
              label: labels.expenses.confidence,
              render: (row) => row.confidence ?? '—',
            },
          ]}
          rows={expenses.data?.expenses || []}
        />
      </QueryPanel>
    </div>
  );
}

export function HarvestsSection({ locale, labels, selectedFarmId }) {
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const enabled = Boolean(selectedFarmId);
  const harvests = useDashboardQuery(
    `/agriculture/farms/${selectedFarmId || 'none'}/harvests`,
    {},
    { enabled },
  );
  const cultivations = useDashboardQuery(
    '/agriculture/cultivations',
    { farmId: selectedFarmId },
    { enabled },
  );

  if (!enabled) return <FarmRequired labels={labels} />;

  const rows = filterRows(harvests.data?.harvests, (row) => {
    if (status && row.status !== status) return false;
    const date = row.harvestedAt ? new Date(row.harvestedAt).getTime() : null;
    if (from && (date === null || date < new Date(from).getTime())) return false;
    if (to && (date === null || date > new Date(`${to}T23:59:59`).getTime())) return false;
    return true;
  });
  const cultivationNames = new Map(
    (cultivations.data?.cultivations || []).map((row) => [row.id, row.code || row.id]),
  );
  const totalKg = sumNumbers(rows, (row) => row.quantityKg);
  const chart = groupByLabel(
    rows,
    (row) => cultivationNames.get(row.cultivationId) || row.cultivationId || labels.notProvided,
    (row) => row.quantityKg,
  );

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.harvests}
        lead={labels.harvests.lead}
        source={labels.source}
      />
      <FilterBar title={labels.sections.harvests}>
        <FilterSelect
          id="harvest-status"
          label={labels.common.status}
          value={status}
          onChange={setStatus}
          allLabel={labels.common.all}
          options={uniqueOptions(harvests.data?.harvests, (row) => row.status)}
        />
        <FilterInput
          id="harvest-from"
          label={labels.common.from}
          type="date"
          value={from}
          onChange={setFrom}
        />
        <FilterInput
          id="harvest-to"
          label={labels.common.to}
          type="date"
          value={to}
          onChange={setTo}
        />
      </FilterBar>

      <InfoGrid
        columns="sm:grid-cols-1"
        items={[
          {
            label: labels.harvests.totalKg,
            value: formatDecimal(totalKg, locale),
          },
        ]}
      />
      <ChartCard title={labels.harvests.chartTitle}>
        <BarChart
          label={labels.harvests.chartTitle}
          data={chart}
          tone="success"
          valueFormatter={(value) => formatDecimal(value, locale)}
        />
      </ChartCard>

      <QueryPanel query={harvests} labels={labels.common}>
        <DataTable
          caption={labels.sections.harvests}
          labels={labels.common}
          columns={[
            {
              id: 'date',
              label: labels.harvests.harvestedAt,
              render: (row) => formatDate(row.harvestedAt, locale),
            },
            {
              id: 'cultivation',
              label: labels.crops.crop,
              render: (row) => cultivationNames.get(row.cultivationId) || row.cultivationId || '—',
            },
            {
              id: 'quantity',
              label: labels.harvests.quantityKg,
              render: (row) => formatDecimal(row.quantityKg, locale),
            },
            {
              id: 'grade',
              label: labels.harvests.qualityGrade,
              render: (row) => row.qualityGrade || '—',
            },
            { id: 'status', label: labels.common.status, render: (row) => row.status || '—' },
          ]}
          rows={rows}
        />
      </QueryPanel>
    </div>
  );
}
