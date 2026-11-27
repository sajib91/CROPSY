'use client';

import Link from 'next/link';
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import {
  QueryPanel,
  SectionHeader,
  useDashboardQuery,
} from '@/components/dashboard/dashboard-primitives';
import { localizedPath } from '@/lib/i18n';
import { localizedText } from '@/lib/marketplace/format';
import { ListingGrid } from './listing-card';
import { MarketplaceAccessGate } from './marketplace-access';

export function SellerProfile({ locale, sellerId, dictionary }) {
  return (
    <MarketplaceAccessGate permission="listings.read" dictionary={dictionary}>
      <SellerProfileBody locale={locale} sellerId={sellerId} dictionary={dictionary} />
    </MarketplaceAccessGate>
  );
}

function SellerProfileBody({ locale, sellerId, dictionary }) {
  const labels = dictionary.seller;
  const panelLabels = {
    loading: dictionary.common.loading,
    errorTitle: dictionary.common.errorTitle,
    retry: dictionary.common.retry,
    emptyTitle: dictionary.common.emptyTitle,
    emptyDescription: dictionary.common.emptyDescription,
    noFarmLead: dictionary.common.noResultsLead,
  };
  const sellerQuery = useDashboardQuery(`/marketplace/sellers/${sellerId}`);
  const listingsQuery = useDashboardQuery('/marketplace/listings', {
    sellerUserId: sellerId,
    status: 'ACTIVE',
    limit: 50,
  });
  const seller = sellerQuery.data;

  return (
    <div className="flex flex-col gap-8">
      <QueryPanel query={sellerQuery} labels={panelLabels}>
        <Card>
          <CardHeader className="border-none pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-1">
                <CardTitle>
                  {localizedText(locale, seller?.displayName, seller?.displayNameBn) ||
                    dictionary.common.notAvailable}
                </CardTitle>
                {seller?.organization?.name ? (
                  <p className="text-body-sm text-content-muted">{seller.organization.name}</p>
                ) : null}
              </div>
              {seller?.verificationStatus ? (
                <Badge tone="info">{seller.verificationStatus}</Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {seller?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={seller.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-20 w-20 rounded-pill border border-line object-cover"
              />
            ) : (
              <p className="text-caption text-content-subtle">{labels.noAvatar}</p>
            )}
          </CardContent>
        </Card>
      </QueryPanel>

      <section className="flex flex-col gap-4">
        <SectionHeader
          title={labels.listingsTitle}
          lead={labels.listingsLead}
          source={dictionary.common.source}
        />
        <QueryPanel query={listingsQuery} labels={panelLabels}>
          {listingsQuery.data?.listings?.length ? (
            <ListingGrid
              locale={locale}
              listings={listingsQuery.data.listings}
              dictionary={dictionary}
            />
          ) : (
            <EmptyState
              title={dictionary.common.noResultsTitle}
              description={dictionary.common.noResultsLead}
            />
          )}
        </QueryPanel>
        <Link
          href={localizedPath(locale, '/marketplace/search')}
          className="text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
        >
          {labels.backToSearch}
        </Link>
      </section>
    </div>
  );
}
