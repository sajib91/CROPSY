'use client';

import Link from 'next/link';
import { useState } from 'react';
import { localizedPath } from '@/lib/i18n';
import { Badge, cn } from '@/components/ui';
import { formatMoney, formatNumber, localizedText, statusTone } from '@/lib/marketplace/format';

export function ListingCard({ locale, listing, dictionary }) {
  const [imageFailed, setImageFailed] = useState(false);
  const labels = dictionary.common;
  const image = [...(listing.images || [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  )[0];
  const productName = localizedText(locale, listing.product?.name, listing.product?.nameBn);
  const gradeName = localizedText(locale, listing.qualityGrade?.name, listing.qualityGrade?.nameBn);
  const href = localizedPath(locale, `/marketplace/listings/${listing.id}`);
  const price = formatMoney(listing.unitPrice, listing.currency, locale);

  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface transition-colors hover:border-brand-500 focus-ring"
    >
      {image && !imageFailed ? (
        <div className="aspect-[4/3] overflow-hidden bg-surface-muted">
          {/* Listing URLs are supplied by the authenticated API; no placeholder image is generated. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt={image.altText || listing.title || productName || ''}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        </div>
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center border-b border-line bg-surface-muted px-4 text-center text-caption text-content-subtle">
          {labels.noImage}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(listing.status)} dot>
            {dictionary.statuses[listing.status] || listing.status}
          </Badge>
          {gradeName ? <Badge tone="info">{gradeName}</Badge> : null}
        </div>

        <div className="min-w-0">
          <h3 className="line-clamp-2 text-subheading font-semibold text-content">
            {listing.title}
          </h3>
          {productName ? (
            <p className="mt-1 truncate text-body-sm text-content-muted">
              {productName}
              {listing.product?.sku ? ` · ${listing.product.sku}` : ''}
            </p>
          ) : null}
        </div>

        <div className="mt-auto flex flex-col gap-1">
          <p className="text-subheading font-semibold text-brand-700 dark:text-brand-300">
            {price || labels.notAvailable}
            <span className="ml-1 text-caption font-normal text-content-muted">
              {listing.product?.unitCode ? `/ ${listing.product.unitCode}` : ''}
            </span>
          </p>
          <p className="text-caption text-content-muted">
            {labels.available}:{' '}
            {formatNumber(listing.quantityAvailable, locale) ?? labels.notAvailable}
            {listing.minOrderQuantity
              ? ` · ${labels.minOrder}: ${formatNumber(listing.minOrderQuantity, locale)}`
              : ''}
          </p>
          {listing.availableLocation ? (
            <p className="truncate text-caption text-content-muted">{listing.availableLocation}</p>
          ) : null}
          {listing.distanceMeters !== null && listing.distanceMeters !== undefined ? (
            <p className="text-caption text-content-subtle">
              {labels.distance}: {formatNumber(listing.distanceMeters / 1000, locale)} km
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function ListingGrid({ locale, listings, dictionary, emptyTitle }) {
  if (!listings || listings.length === 0) {
    return (
      <div className={cn('rounded-card border border-line bg-surface p-card')}>
        {emptyTitle || dictionary.common.emptyTitle}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {listings.map((listing) => (
        <ListingCard key={listing.id} locale={locale} listing={listing} dictionary={dictionary} />
      ))}
    </div>
  );
}
