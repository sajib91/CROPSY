'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/auth-provider';
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
  Modal,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  DataTable,
  QueryPanel,
  SectionHeader,
  useDashboardQuery,
} from '@/components/dashboard/dashboard-primitives';
import { deactivateListing, createListing, updateListing } from '@/lib/marketplace/client';
import { localizedPath } from '@/lib/i18n';
import {
  formatDate,
  formatMoney,
  formatNumber,
  localizedText,
  statusTone,
} from '@/lib/marketplace/format';
import { MarketplaceAccessGate } from './marketplace-access';

const EMPTY_FORM = {
  productId: '',
  status: 'DRAFT',
  title: '',
  description: '',
  unitPrice: '',
  currency: 'BDT',
  quantityAvailable: '',
  minOrderQuantity: '1',
  qualityGradeId: '',
  harvestDate: '',
  availableLocation: '',
  imageUrl: '',
};

function formFromListing(listing) {
  return {
    productId: listing.productId || '',
    status: listing.status || 'DRAFT',
    title: listing.title || '',
    description: listing.description || '',
    unitPrice: String(listing.unitPrice ?? ''),
    currency: listing.currency || 'BDT',
    quantityAvailable: String(listing.quantityAvailable ?? ''),
    minOrderQuantity: String(listing.minOrderQuantity ?? 1),
    qualityGradeId: listing.qualityGrade?.id || '',
    harvestDate: listing.harvestDate || '',
    availableLocation: listing.availableLocation || '',
    imageUrl: '',
  };
}

export function SellerListings({ locale, dictionary }) {
  return (
    <MarketplaceAccessGate permission="listings.manage" dictionary={dictionary}>
      <SellerListingsBody locale={locale} dictionary={dictionary} />
    </MarketplaceAccessGate>
  );
}

function SellerListingsBody({ locale, dictionary }) {
  const labels = dictionary.manage;
  const toast = useToast();
  const { session } = useAuth();
  const sellerId = session?.user?.id;
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const panelLabels = {
    loading: dictionary.common.loading,
    errorTitle: dictionary.common.errorTitle,
    retry: dictionary.common.retry,
    emptyTitle: dictionary.common.emptyTitle,
    emptyDescription: dictionary.common.emptyDescription,
    noFarmLead: dictionary.common.noResultsLead,
  };

  const listingsQuery = useDashboardQuery(
    '/marketplace/listings',
    { sellerUserId: sellerId, limit: 50 },
    { enabled: Boolean(sellerId) },
  );
  const productsQuery = useDashboardQuery('/catalog/products', {});
  const gradesQuery = useDashboardQuery('/catalog/quality-grades', { isActive: 'true' });

  useEffect(() => {
    if (!editor) return;
    setForm(editor.listing ? formFromListing(editor.listing) : EMPTY_FORM);
    setError('');
  }, [editor]);

  const products = productsQuery.data?.products || [];
  const grades = gradesQuery.data?.qualityGrades || [];
  const listings = listingsQuery.data?.listings || [];

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function buildPayload() {
    const payload = {
      status: form.status,
      title: form.title.trim(),
      description: form.description.trim() ? form.description.trim() : null,
      unitPrice: Number(form.unitPrice),
      currency: form.currency.trim().toUpperCase(),
      quantityAvailable: Number(form.quantityAvailable),
      minOrderQuantity: Number(form.minOrderQuantity),
      qualityGradeId: form.qualityGradeId || null,
      harvestDate: form.harvestDate || null,
      availableLocation: form.availableLocation.trim() || null,
    };
    if (!editor.listing) payload.productId = form.productId;
    if (!editor.listing && form.imageUrl.trim()) {
      payload.images = [{ url: form.imageUrl.trim() }];
    }
    return payload;
  }

  function validateForm() {
    if (!editor.listing && !form.productId) return labels.productRequired;
    if (!form.title.trim()) return labels.titleRequired;
    if (!Number.isFinite(Number(form.unitPrice)) || Number(form.unitPrice) <= 0) {
      return labels.priceRequired;
    }
    if (!Number.isFinite(Number(form.quantityAvailable)) || Number(form.quantityAvailable) <= 0) {
      return labels.stockRequired;
    }
    if (!Number.isFinite(Number(form.minOrderQuantity)) || Number(form.minOrderQuantity) <= 0) {
      return labels.minRequired;
    }
    if (!form.availableLocation.trim() && !form.harvestDate) {
      return labels.locationOrHarvest;
    }
    if (!/^[A-Z]{3}$/.test(form.currency.trim().toUpperCase())) {
      return labels.currencyInvalid;
    }
    return '';
  }

  async function saveListing(event) {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setBusy(true);
    try {
      if (editor.listing) {
        await updateListing(editor.listing.id, buildPayload());
      } else {
        await createListing(buildPayload());
      }
      toast.success(labels.saved);
      setEditor(null);
      await listingsQuery.reload();
    } catch (requestError) {
      setError(requestError?.message || dictionary.common.actionFailed);
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    if (!deactivateTarget) return;
    setError('');
    setBusy(true);
    try {
      await deactivateListing(deactivateTarget.id);
      toast.success(labels.deactivated);
      setDeactivateTarget(null);
      await listingsQuery.reload();
    } catch (requestError) {
      setError(requestError?.message || dictionary.common.actionFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.title}
        lead={labels.lead}
        source={dictionary.common.source}
        actions={
          <Button
            onClick={() => {
              setEditor({ listing: null });
              setError('');
            }}
            disabled={products.length === 0}
          >
            {labels.create}
          </Button>
        }
      />

      {!sellerId ? <InlineError title={labels.noSellerId} /> : null}
      {error ? <InlineError title={error} /> : null}
      {productsQuery.status === 'error' ? (
        <InlineError title={labels.catalogUnavailable} description={productsQuery.error?.message} />
      ) : null}

      <QueryPanel query={listingsQuery} labels={panelLabels}>
        <DataTable
          caption={labels.title}
          columns={[
            {
              id: 'title',
              label: dictionary.common.title,
              render: (listing) => (
                <div className="flex flex-col gap-1">
                  <Link
                    href={localizedPath(locale, `/marketplace/listings/${listing.id}`)}
                    className="font-medium text-brand-700 hover:underline dark:text-brand-300"
                  >
                    {listing.title}
                  </Link>
                  <span className="text-caption text-content-subtle">
                    {localizedText(locale, listing.product?.name, listing.product?.nameBn) ||
                      listing.productId}
                  </span>
                </div>
              ),
            },
            {
              id: 'status',
              label: dictionary.common.status,
              render: (listing) => (
                <Badge tone={statusTone(listing.status)} dot>
                  {dictionary.statuses[listing.status] || listing.status}
                </Badge>
              ),
            },
            {
              id: 'price',
              label: dictionary.common.unitPrice,
              render: (listing) => formatMoney(listing.unitPrice, listing.currency, locale),
            },
            {
              id: 'stock',
              label: dictionary.common.quantityAvailable,
              render: (listing) => formatNumber(listing.quantityAvailable, locale),
            },
            {
              id: 'harvestDate',
              label: dictionary.common.harvestDate,
              render: (listing) =>
                formatDate(listing.harvestDate, locale) || dictionary.common.notAvailable,
            },
            {
              id: 'actions',
              label: dictionary.common.actions,
              render: (listing) => (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditor({ listing });
                      setError('');
                    }}
                  >
                    {labels.edit}
                  </Button>
                  {listing.status !== 'INACTIVE' && listing.status !== 'CANCELLED' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDeactivateTarget(listing);
                        setError('');
                      }}
                    >
                      {labels.deactivate}
                    </Button>
                  ) : null}
                </div>
              ),
            },
          ]}
          rows={listings}
          labels={panelLabels}
          emptyTitle={labels.noListings}
        />
      </QueryPanel>

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.listing ? labels.editTitle : labels.createTitle}
        description={labels.formLead}
        size="xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditor(null)}>
              {dictionary.common.cancel}
            </Button>
            <Button type="submit" form="listing-form" loading={busy} loadingText={labels.saving}>
              {editor?.listing ? labels.saveChanges : labels.create}
            </Button>
          </div>
        }
      >
        <form id="listing-form" onSubmit={saveListing} className="grid gap-4 sm:grid-cols-2">
          {!editor?.listing ? (
            <Field label={labels.product} required className="sm:col-span-2">
              <Select
                id="listing-product"
                value={form.productId}
                onChange={(event) => setField('productId', event.target.value)}
                options={[
                  { value: '', label: labels.selectProduct },
                  ...products.map((product) => ({
                    value: product.id,
                    label:
                      localizedText(locale, product.name, product.nameBn) ||
                      product.sku ||
                      product.id,
                  })),
                ]}
              />
            </Field>
          ) : null}

          <Field label={dictionary.common.title} required className="sm:col-span-2">
            <Input
              id="listing-title"
              value={form.title}
              onChange={(event) => setField('title', event.target.value)}
            />
          </Field>

          <Field label={labels.status}>
            <Select
              id="listing-status"
              value={form.status}
              onChange={(event) => setField('status', event.target.value)}
              options={[
                { value: 'DRAFT', label: dictionary.statuses.DRAFT },
                { value: 'ACTIVE', label: dictionary.statuses.ACTIVE },
                { value: 'INACTIVE', label: dictionary.statuses.INACTIVE },
              ]}
            />
          </Field>

          <Field label={dictionary.common.currency} required>
            <Input
              id="listing-currency"
              value={form.currency}
              maxLength={3}
              onChange={(event) => setField('currency', event.target.value)}
            />
          </Field>

          <Field label={dictionary.common.unitPrice} required>
            <Input
              id="listing-price"
              type="number"
              min="0"
              step="0.01"
              value={form.unitPrice}
              onChange={(event) => setField('unitPrice', event.target.value)}
            />
          </Field>

          <Field label={dictionary.common.quantityAvailable} required>
            <Input
              id="listing-stock"
              type="number"
              min="0"
              step="any"
              value={form.quantityAvailable}
              onChange={(event) => setField('quantityAvailable', event.target.value)}
            />
          </Field>

          <Field label={dictionary.common.minOrder} required>
            <Input
              id="listing-min-order"
              type="number"
              min="0"
              step="any"
              value={form.minOrderQuantity}
              onChange={(event) => setField('minOrderQuantity', event.target.value)}
            />
          </Field>

          <Field label={labels.qualityGrade}>
            <Select
              id="listing-grade"
              value={form.qualityGradeId}
              onChange={(event) => setField('qualityGradeId', event.target.value)}
              options={[
                { value: '', label: labels.noGrade },
                ...grades.map((grade) => ({
                  value: grade.id,
                  label: localizedText(locale, grade.name, grade.nameBn) || grade.code || grade.id,
                })),
              ]}
            />
          </Field>

          <Field label={dictionary.common.harvestDate}>
            <Input
              id="listing-harvest"
              type="date"
              value={form.harvestDate}
              onChange={(event) => setField('harvestDate', event.target.value)}
            />
          </Field>

          <Field label={dictionary.common.availableLocation} className="sm:col-span-2">
            <Input
              id="listing-location"
              value={form.availableLocation}
              onChange={(event) => setField('availableLocation', event.target.value)}
              placeholder={labels.locationPlaceholder}
            />
          </Field>

          {!editor?.listing ? (
            <Field label={labels.imageUrl} className="sm:col-span-2">
              <Input
                id="listing-image"
                type="url"
                value={form.imageUrl}
                onChange={(event) => setField('imageUrl', event.target.value)}
              />
            </Field>
          ) : null}

          <Field label={dictionary.common.description} className="sm:col-span-2">
            <Textarea
              id="listing-description"
              rows={4}
              value={form.description}
              onChange={(event) => setField('description', event.target.value)}
            />
          </Field>

          <p className="text-caption text-content-subtle sm:col-span-2">{labels.formLead}</p>
          {error ? <InlineError title={error} className="sm:col-span-2" /> : null}
        </form>
      </Modal>

      <Modal
        open={Boolean(deactivateTarget)}
        onClose={() => setDeactivateTarget(null)}
        title={labels.deactivateTitle}
        description={labels.deactivateLead}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeactivateTarget(null)}>
              {dictionary.common.cancel}
            </Button>
            <Button variant="danger" loading={busy} onClick={deactivate}>
              {labels.deactivateConfirm}
            </Button>
          </div>
        }
      >
        <Card>
          <CardHeader className="border-none pb-2">
            <CardTitle>{deactivateTarget?.title}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-body-sm text-content-muted">
            {deactivateTarget?.product?.sku || deactivateTarget?.productId}
          </CardContent>
        </Card>
        {error ? <InlineError title={error} /> : null}
      </Modal>
    </div>
  );
}
