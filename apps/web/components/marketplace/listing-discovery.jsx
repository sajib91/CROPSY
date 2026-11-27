'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, EmptyState, Field, Input, InlineError, Select } from '@/components/ui';
import {
  FilterBar,
  QueryPanel,
  SectionHeader,
  useDashboardQuery,
} from '@/components/dashboard/dashboard-primitives';
import { localizedPath } from '@/lib/i18n';
import { localizedText } from '@/lib/marketplace/format';
import { ListingGrid } from './listing-card';

const EMPTY_FILTERS = {
  search: '',
  categoryId: '',
  minPrice: '',
  maxPrice: '',
  location: '',
  latitude: '',
  longitude: '',
  radiusMeters: '',
  sort: 'newest',
};

function firstValue(value) {
  if (Array.isArray(value)) return value[0] || '';
  return value === undefined || value === null ? '' : String(value);
}

function normalizeFilters(filters, fixedParams = {}) {
  const merged = { ...EMPTY_FILTERS, ...filters, ...fixedParams };
  const result = {};
  for (const [key, value] of Object.entries(merged)) {
    if (key in EMPTY_FILTERS || key === 'productId' || key === 'sellerUserId') {
      result[key] = firstValue(value);
    }
  }
  return result;
}

function queryFromFilters(filters, fixedParams, limit) {
  const merged = { ...filters, ...fixedParams };
  const query = {
    search: merged.search,
    categoryId: merged.categoryId,
    productId: merged.productId,
    sellerUserId: merged.sellerUserId,
    minPrice: merged.minPrice,
    maxPrice: merged.maxPrice,
    location: merged.location,
    sort: merged.sort || 'newest',
    status: 'ACTIVE',
    limit,
    offset: 0,
  };
  // The API requires all three proximity fields together. A partial browser
  // geolocation result is omitted instead of producing a broken query.
  if (merged.latitude && merged.longitude && merged.radiusMeters) {
    query.latitude = merged.latitude;
    query.longitude = merged.longitude;
    query.radiusMeters = merged.radiusMeters;
  }
  return query;
}

export function ListingDiscovery({
  locale,
  dictionary,
  path,
  initialFilters = {},
  fixedParams = {},
  expanded = false,
  limit = 50,
  title,
  lead,
}) {
  const router = useRouter();
  const labels = dictionary.discovery;
  const [filters, setFilters] = useState(() => normalizeFilters(initialFilters, fixedParams));
  const [geoMessage, setGeoMessage] = useState('');
  const [locating, setLocating] = useState(false);
  const initialKey = JSON.stringify(initialFilters);
  const fixedKey = JSON.stringify(fixedParams);

  useEffect(() => {
    setFilters(normalizeFilters(JSON.parse(initialKey), JSON.parse(fixedKey)));
  }, [initialKey, fixedKey]);

  const categoriesQuery = useDashboardQuery('/catalog/categories', { isActive: 'true' });
  const query = useDashboardQuery(
    '/marketplace/listings',
    queryFromFilters(filters, fixedParams, limit),
  );

  const categoryOptions = useMemo(() => {
    const categories = categoriesQuery.data || [];
    return categories.map((category) => ({
      value: category.id,
      label: localizedText(locale, category.name, category.nameBn) || category.code || category.id,
    }));
  }, [categoriesQuery.data, locale]);

  function setField(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(event) {
    event.preventDefault();
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (key.startsWith('fixed:') || value === '' || (key === 'sort' && value === 'newest'))
        continue;
      search.set(key, String(value));
    }
    router.push(`${path}${search.size ? `?${search.toString()}` : ''}`);
  }

  function clearFilters() {
    setFilters(normalizeFilters({}, fixedParams));
    setGeoMessage('');
    router.push(path);
  }

  function useMyLocation() {
    setGeoMessage('');
    if (!globalThis.navigator?.geolocation) {
      setGeoMessage(labels.locationUnavailable);
      return;
    }
    setLocating(true);
    globalThis.navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setFilters((current) => ({
          ...current,
          latitude: String(Number(position.coords.latitude.toFixed(6))),
          longitude: String(Number(position.coords.longitude.toFixed(6))),
          radiusMeters: current.radiusMeters || '10000',
        }));
      },
      () => {
        setLocating(false);
        setGeoMessage(labels.locationDenied);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  const panelLabels = {
    loading: dictionary.common.loading,
    errorTitle: dictionary.common.errorTitle,
    retry: dictionary.common.retry,
    emptyTitle: dictionary.common.emptyTitle,
    emptyDescription: dictionary.common.emptyDescription,
    noFarmLead: dictionary.common.noResultsLead,
  };

  return (
    <section className="flex flex-col gap-5">
      <SectionHeader
        title={title || labels.title}
        lead={lead || labels.lead}
        source={dictionary.common.source}
        actions={
          <Link
            href={localizedPath(locale, '/marketplace/filters')}
            className="text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
          >
            {labels.allFilters}
          </Link>
        }
      />

      <form onSubmit={applyFilters} className="flex flex-col gap-3">
        <FilterBar title={labels.filterTitle}>
          <Field label={labels.searchLabel}>
            <Input
              id="listing-search"
              value={filters.search}
              onChange={(event) => setField('search', event.target.value)}
              placeholder={labels.searchPlaceholder}
            />
          </Field>

          <Field label={labels.categoryLabel}>
            <Select
              id="listing-category"
              value={filters.categoryId}
              onChange={(event) => setField('categoryId', event.target.value)}
              options={[{ value: '', label: labels.allCategories }, ...categoryOptions]}
            />
          </Field>

          <Field label={labels.sortLabel}>
            <Select
              id="listing-sort"
              value={filters.sort}
              onChange={(event) => setField('sort', event.target.value)}
              options={[
                { value: 'newest', label: labels.sortNewest },
                { value: 'price_asc', label: labels.sortPriceAsc },
                { value: 'price_desc', label: labels.sortPriceDesc },
                { value: 'distance', label: labels.sortDistance },
              ]}
            />
          </Field>

          {expanded ? (
            <>
              <Field label={labels.locationLabel}>
                <Input
                  id="listing-location"
                  value={filters.location}
                  onChange={(event) => setField('location', event.target.value)}
                  placeholder={labels.locationPlaceholder}
                />
              </Field>
              <Field label={labels.minPriceLabel}>
                <Input
                  id="listing-min-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={filters.minPrice}
                  onChange={(event) => setField('minPrice', event.target.value)}
                />
              </Field>
              <Field label={labels.maxPriceLabel}>
                <Input
                  id="listing-max-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={filters.maxPrice}
                  onChange={(event) => setField('maxPrice', event.target.value)}
                />
              </Field>
              <Field label={labels.radiusLabel}>
                <Select
                  id="listing-radius"
                  value={filters.radiusMeters}
                  onChange={(event) => setField('radiusMeters', event.target.value)}
                  options={[
                    { value: '', label: labels.anyDistance },
                    { value: '5000', label: labels.radius5 },
                    { value: '25000', label: labels.radius25 },
                    { value: '100000', label: labels.radius100 },
                  ]}
                />
              </Field>
              <div className="flex flex-col justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={useMyLocation}
                  loading={locating}
                >
                  {labels.useMyLocation}
                </Button>
                {geoMessage ? <InlineError title={geoMessage} /> : null}
              </div>
            </>
          ) : null}
        </FilterBar>

        <div className="flex flex-wrap gap-2">
          <Button type="submit">{labels.applyFilters}</Button>
          <Button type="button" variant="ghost" onClick={clearFilters}>
            {labels.clearFilters}
          </Button>
          {filters.latitude && filters.longitude && filters.radiusMeters ? (
            <span className="self-center text-caption text-content-subtle">
              {labels.locationActive}
            </span>
          ) : null}
        </div>
      </form>

      {categoriesQuery.status === 'error' ? (
        <InlineError
          title={dictionary.discovery.categoriesUnavailable}
          description={categoriesQuery.error?.message}
        />
      ) : null}

      <QueryPanel query={query} labels={panelLabels}>
        <div className="flex flex-col gap-4">
          <p className="text-caption text-content-muted">
            {(query.data?.listings || []).length} {dictionary.common.recordsReturned}
          </p>
          <ListingGrid
            locale={locale}
            listings={query.data?.listings || []}
            dictionary={dictionary}
            emptyTitle={dictionary.common.noResultsTitle}
          />
        </div>
      </QueryPanel>

      {!expanded ? (
        <EmptyState
          compact
          title={labels.discoveryHintTitle}
          description={labels.discoveryHintLead}
        />
      ) : null}
    </section>
  );
}
