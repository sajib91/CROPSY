'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/auth-provider';
import { canAccess } from '@/lib/auth/roles';
import {
  Badge,
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
  DataTable,
  QueryPanel,
  useDashboardQuery,
} from '@/components/dashboard/dashboard-primitives';
import { addCartItem } from '@/lib/marketplace/client';
import { localizedPath } from '@/lib/i18n';
import {
  formatDate,
  formatMoney,
  formatNumber,
  localizedText,
  statusTone,
} from '@/lib/marketplace/format';
import { ListingGallery } from './listing-gallery';
import { MarketplaceAccessGate } from './marketplace-access';

export function ListingDetail({ locale, listingId, dictionary }) {
  return (
    <MarketplaceAccessGate permission="listings.read" dictionary={dictionary}>
      <ListingDetailBody locale={locale} listingId={listingId} dictionary={dictionary} />
    </MarketplaceAccessGate>
  );
}

function ListingDetailBody({ locale, listingId, dictionary }) {
  const labels = dictionary.detail;
  const { session } = useAuth();
  const router = useRouter();
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const listingQuery = useDashboardQuery(`/marketplace/listings/${listingId}`);
  const listing = listingQuery.data;
  const productQuery = useDashboardQuery(
    `/catalog/products/${listing?.productId || 'unknown'}`,
    {},
    { enabled: Boolean(listing?.productId) },
  );

  useEffect(() => {
    if (listing?.minOrderQuantity !== undefined && listing?.minOrderQuantity !== null) {
      setQuantity(String(listing.minOrderQuantity));
    }
  }, [listing?.minOrderQuantity]);

  const panelLabels = {
    loading: dictionary.common.loading,
    errorTitle: dictionary.common.errorTitle,
    retry: dictionary.common.retry,
    emptyTitle: dictionary.common.emptyTitle,
    emptyDescription: dictionary.common.emptyDescription,
    noFarmLead: dictionary.common.noResultsLead,
  };

  async function addToCart() {
    setActionError('');
    const parsed = Number(quantity);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setActionError(labels.invalidQuantity);
      return;
    }
    setBusy(true);
    try {
      await addCartItem({ listingId, quantity: parsed });
      router.push(localizedPath(locale, '/marketplace/cart'));
    } catch (error) {
      setActionError(error?.message || dictionary.common.actionFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <QueryPanel query={listingQuery} labels={panelLabels}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="flex flex-col gap-4">
          <ListingGallery
            locale={locale}
            images={listing.images || []}
            productImages={productQuery.data?.images || []}
            title={listing.title}
            dictionary={dictionary}
          />
          <Card>
            <CardHeader className="border-none pb-2">
              <CardTitle>{labels.descriptionTitle}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="whitespace-pre-wrap text-body-sm text-content-muted">
                {listing.description || labels.noDescription}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(listing.status)} dot>
                {dictionary.statuses[listing.status] || listing.status}
              </Badge>
              {listing.qualityGrade ? (
                <Badge tone="info">
                  {localizedText(locale, listing.qualityGrade.name, listing.qualityGrade.nameBn) ||
                    listing.qualityGrade.code}
                </Badge>
              ) : null}
            </div>
            <h2 className="text-title font-bold text-content">{listing.title}</h2>
            {listing.product ? (
              <p className="text-body-sm text-content-muted">
                {localizedText(locale, listing.product.name, listing.product.nameBn)}{' '}
                {listing.product.sku ? `· ${listing.product.sku}` : ''}
              </p>
            ) : null}
            <p className="text-display font-bold text-brand-700 dark:text-brand-300">
              {formatMoney(listing.unitPrice, listing.currency, locale) ||
                dictionary.common.notAvailable}
              {listing.product?.unitCode ? (
                <span className="ml-2 text-body-sm font-normal text-content-muted">
                  / {listing.product.unitCode}
                </span>
              ) : null}
            </p>
          </div>

          <Card>
            <CardHeader className="border-none pb-2">
              <CardTitle>{labels.availabilityTitle}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-0">
              <dl className="grid grid-cols-2 gap-3 text-body-sm">
                <div>
                  <dt className="text-caption text-content-subtle">
                    {dictionary.common.available}
                  </dt>
                  <dd className="font-medium text-content">
                    {formatNumber(listing.quantityAvailable, locale) ??
                      dictionary.common.notAvailable}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-content-subtle">{dictionary.common.minOrder}</dt>
                  <dd className="font-medium text-content">
                    {formatNumber(listing.minOrderQuantity, locale) ??
                      dictionary.common.notAvailable}
                  </dd>
                </div>
              </dl>
              <Field label={labels.quantityLabel} hint={labels.quantityHint}>
                <Input
                  id="listing-quantity"
                  type="number"
                  min={listing.minOrderQuantity || undefined}
                  max={listing.quantityAvailable || undefined}
                  step="any"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </Field>
              {canAccess(session, 'orders.manage') ? (
                <Button
                  type="button"
                  onClick={addToCart}
                  loading={busy}
                  loadingText={labels.adding}
                  disabled={
                    listing.status !== 'ACTIVE' ||
                    listing.product?.isAvailable === false ||
                    listing.quantityAvailable < listing.minOrderQuantity
                  }
                  fullWidth
                >
                  {labels.addToCart}
                </Button>
              ) : (
                <p className="text-body-sm text-content-muted">{labels.signInToBuy}</p>
              )}
              {actionError ? <InlineError title={actionError} /> : null}
              <p className="text-caption text-content-subtle">{labels.checkoutRevalidation}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-none pb-2">
              <CardTitle>{labels.qualityTitle}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <dl className="grid grid-cols-2 gap-3 text-body-sm">
                <div>
                  <dt className="text-caption text-content-subtle">{labels.grade}</dt>
                  <dd className="font-medium text-content">
                    {listing.qualityGrade
                      ? localizedText(
                          locale,
                          listing.qualityGrade.name,
                          listing.qualityGrade.nameBn,
                        ) || listing.qualityGrade.code
                      : dictionary.common.notAvailable}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-content-subtle">{labels.harvestDate}</dt>
                  <dd className="font-medium text-content">
                    {formatDate(listing.harvestDate, locale) || dictionary.common.notAvailable}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-caption text-content-muted">{labels.qualityLead}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-none pb-2">
              <CardTitle>{labels.locationTitle}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 pt-0 text-body-sm">
              <p className="text-content">
                {listing.availableLocation || dictionary.common.notAvailable}
              </p>
              {listing.locations?.length ? (
                <ul className="flex flex-wrap gap-2">
                  {listing.locations.map((location) => (
                    <li key={location.id}>
                      <Badge tone="neutral">{location.label || location.id}</Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
              {listing.distanceMeters !== null && listing.distanceMeters !== undefined ? (
                <p className="text-caption text-content-muted">
                  {labels.distance}: {formatNumber(listing.distanceMeters / 1000, locale)} km
                </p>
              ) : null}
            </CardContent>
          </Card>

          {listing.seller ? (
            <Card>
              <CardHeader className="border-none pb-2">
                <CardTitle>{labels.sellerTitle}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 pt-0 text-body-sm">
                <p className="font-medium text-content">
                  {localizedText(
                    locale,
                    listing.seller.displayName,
                    listing.seller.displayNameBn,
                  ) || dictionary.common.notAvailable}
                </p>
                {listing.seller.organization?.name ? (
                  <p className="text-content-muted">{listing.seller.organization.name}</p>
                ) : null}
                {listing.seller.verificationStatus ? (
                  <p className="text-caption text-content-subtle">
                    {labels.verification}: {listing.seller.verificationStatus}
                  </p>
                ) : null}
                <Link
                  href={localizedPath(locale, `/marketplace/sellers/${listing.seller.id}`)}
                  className="text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
                >
                  {labels.viewSeller}
                </Link>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {productQuery.status === 'success' && productQuery.data?.attributes?.length ? (
        <section className="mt-8 flex flex-col gap-4">
          <h3 className="text-heading font-semibold text-content">{labels.attributesTitle}</h3>
          <DataTable
            caption={labels.attributesTitle}
            columns={[
              {
                id: 'name',
                label: dictionary.common.name,
                render: (attribute) =>
                  localizedText(locale, attribute.name, attribute.nameBn) || attribute.code,
              },
              {
                id: 'value',
                label: dictionary.common.value,
                render: (attribute) => String(attribute.value),
              },
              {
                id: 'type',
                label: dictionary.common.type,
                render: (attribute) => attribute.valueType,
              },
            ]}
            rows={productQuery.data.attributes}
            labels={panelLabels}
          />
        </section>
      ) : null}
    </QueryPanel>
  );
}
