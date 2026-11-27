'use client';

import Link from 'next/link';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import {
  QueryPanel,
  SectionHeader,
  useDashboardQuery,
} from '@/components/dashboard/dashboard-primitives';
import { localizedPath } from '@/lib/i18n';
import { localizedText } from '@/lib/marketplace/format';

export function CategoryDirectory({ locale, dictionary }) {
  const labels = dictionary.categories;
  const panelLabels = {
    loading: dictionary.common.loading,
    errorTitle: dictionary.common.errorTitle,
    retry: dictionary.common.retry,
    emptyTitle: dictionary.common.emptyTitle,
    emptyDescription: dictionary.common.emptyDescription,
    noFarmLead: dictionary.common.noResultsLead,
  };
  const categoriesQuery = useDashboardQuery('/catalog/categories', { isActive: 'true' });
  const productsQuery = useDashboardQuery('/catalog/products', { isAvailable: 'true' });

  const categories = categoriesQuery.data?.categories || [];
  const products = productsQuery.data?.products || [];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <SectionHeader
          title={labels.categoryTitle}
          lead={labels.categoryLead}
          source={dictionary.common.source}
        />
        <QueryPanel query={categoriesQuery} labels={panelLabels}>
          {categories.length === 0 ? (
            <p className="rounded-card border border-line bg-surface p-card text-body-sm text-content-muted">
              {labels.noCategories}
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`${localizedPath(locale, '/marketplace/search')}?categoryId=${encodeURIComponent(category.id)}`}
                    className="flex h-full flex-col gap-2 rounded-card border border-line bg-surface p-4 transition-colors hover:border-brand-500 focus-ring"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-subheading font-semibold text-content">
                        {localizedText(locale, category.name, category.nameBn) || category.code}
                      </h3>
                      <Badge tone="neutral">{category.code}</Badge>
                    </div>
                    <p className="text-body-sm text-content-muted">
                      {localizedText(locale, category.description, category.descriptionBn) ||
                        labels.noDescription}
                    </p>
                    <p className="mt-auto text-caption font-semibold text-brand-700 dark:text-brand-300">
                      {labels.viewListings}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </QueryPanel>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeader
          title={labels.productTitle}
          lead={labels.productLead}
          source={dictionary.common.source}
        />
        <QueryPanel query={productsQuery} labels={panelLabels}>
          {products.length === 0 ? (
            <p className="rounded-card border border-line bg-surface p-card text-body-sm text-content-muted">
              {labels.noProducts}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <Card key={product.id}>
                  <CardHeader className="border-none pb-2">
                    <CardTitle>
                      {localizedText(locale, product.name, product.nameBn) || product.sku}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 pt-0">
                    <p className="text-body-sm text-content-muted">
                      {localizedText(locale, product.description, product.descriptionBn) ||
                        labels.noDescription}
                    </p>
                    <dl className="grid grid-cols-2 gap-2 text-caption">
                      <dt className="text-content-subtle">{labels.sku}</dt>
                      <dd className="text-content">{product.sku}</dd>
                      <dt className="text-content-subtle">{labels.unit}</dt>
                      <dd className="text-content">
                        {localizedText(locale, product.unitName, product.unitNameBn) ||
                          product.unitCode}
                      </dd>
                      <dt className="text-content-subtle">{labels.category}</dt>
                      <dd className="text-content">
                        {localizedText(locale, product.categoryName, product.categoryNameBn) ||
                          product.categoryCode ||
                          dictionary.common.notAvailable}
                      </dd>
                    </dl>
                    <Link
                      href={`${localizedPath(locale, '/marketplace/search')}?productId=${encodeURIComponent(product.id)}`}
                      className="mt-auto text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
                    >
                      {labels.viewListings}
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </QueryPanel>
      </section>
    </div>
  );
}
