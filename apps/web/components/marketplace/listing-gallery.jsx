'use client';

import { useState } from 'react';
import { EmptyState, cn } from '@/components/ui';
import { localizedText } from '@/lib/marketplace/format';

export function ListingGallery({ locale, images = [], title, dictionary, productImages = [] }) {
  const combined = [
    ...images.map((image) => ({ ...image, source: 'listing' })),
    ...productImages
      .filter((image) => !images.some((listingImage) => listingImage.url === image.url))
      .map((image) => ({ ...image, source: 'product' })),
  ].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState({});
  const active = combined[selected] || null;

  if (combined.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface p-card">
        <EmptyState
          compact
          title={dictionary.common.noImage}
          description={dictionary.common.noImageLead}
        />
      </div>
    );
  }

  return (
    <section aria-label={dictionary.detail.galleryLabel} className="flex flex-col gap-3">
      {active && !failed[`${active.source}-${active.id}`] ? (
        <div className="aspect-[4/3] overflow-hidden rounded-card border border-line bg-surface-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={active.url}
            alt={
              localizedText(
                locale,
                active.altText,
                active.source === 'product' ? active.altTextBn : null,
              ) ||
              title ||
              ''
            }
            referrerPolicy="no-referrer"
            onError={() =>
              setFailed((current) => ({ ...current, [`${active.source}-${active.id}`]: true }))
            }
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center rounded-card border border-line bg-surface-muted px-4 text-center text-body-sm text-content-subtle">
          {dictionary.common.imageUnavailable}
        </div>
      )}

      {combined.length > 1 ? (
        <ul className="flex flex-wrap gap-2">
          {combined.map((image, index) => (
            <li key={`${image.source}-${image.id}`}>
              <button
                type="button"
                aria-label={`${dictionary.detail.imageOption} ${index + 1}`}
                aria-pressed={selected === index}
                onClick={() => setSelected(index)}
                className={cn(
                  'h-16 w-16 overflow-hidden rounded-control border bg-surface-muted focus-ring',
                  selected === index ? 'border-brand-600 ring-2 ring-brand-500/30' : 'border-line',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setFailed((current) => ({
                      ...current,
                      [`${image.source}-${image.id}`]: true,
                    }))
                  }
                  className="h-full w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
