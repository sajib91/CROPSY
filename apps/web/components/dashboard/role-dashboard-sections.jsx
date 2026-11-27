'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { dashboardPost } from '@/lib/dashboard/client';
import { canAccess } from '@/lib/auth/roles';
import { getRoleProfiles, getUserProfile, updateUserProfile } from '@/lib/auth/client';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Modal,
  Select,
  useToast,
} from '../ui';
import {
  DataTable,
  EmptyPanel,
  InfoGrid,
  QueryPanel,
  RecordPairs,
  SectionHeader,
} from './dashboard-primitives';

export function sourceRows(data, arrayKey) {
  if (!data) return [];
  if (arrayKey && Array.isArray(data[arrayKey])) return data[arrayKey];
  if (Array.isArray(data)) return data;
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function sourceMetrics(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.entries(data)
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .map(([key, value]) => ({ key, value }));
}

function displayValue(value, locale, labels) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) {
    return value.map((item) => displayValue(item, locale, labels)).join(', ');
  }
  if (typeof value === 'boolean') {
    return value
      ? (labels.fields?.yes ?? labels.common?.yes)
      : (labels.fields?.no ?? labels.common?.no);
  }
  if (typeof value === 'number') {
    return new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-US').format(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
    }
  }
  return String(value);
}

function nestedValue(row, key) {
  return key
    .split('.')
    .reduce((current, part) => (current == null ? undefined : current[part]), row);
}

function autoColumns(rows, labels) {
  const keys = [];
  for (const row of rows.slice(0, 12)) {
    for (const key of Object.keys(row || {})) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys.slice(0, 8).map((key) => ({
    id: key,
    label: labels.fields[key] || key.replace(/([A-Z])/g, ' $1'),
    render: (row) => displayValue(nestedValue(row, key), labels.locale, labels),
  }));
}

export function OverviewSection({ config, sources, labels, locale, onNavigate }) {
  const cards = [];
  for (const item of config.sections) {
    if (
      !item.endpoint ||
      item.kind === 'overview' ||
      item.kind === 'profile' ||
      item.kind === 'notifications'
    ) {
      continue;
    }
    const query = sources[item.id];
    if (!query || query.status !== 'success') continue;
    const rows = sourceRows(query.data, item.arrayKey);
    const metrics = sourceMetrics(query.data);
    if (rows.length > 0) {
      cards.push({
        id: item.id,
        label: labels.sections[item.labelKey] || item.labelKey,
        value: displayValue(rows.length, locale, labels),
        helper: labels.common.recordsReturned,
      });
    } else if (metrics.length > 0) {
      cards.push({
        id: item.id,
        label: labels.sections[item.labelKey] || item.labelKey,
        value: displayValue(metrics[0].value, locale, labels),
        helper: labels.fields[metrics[0].key] || metrics[0].key,
      });
    }
  }

  if (cards.length === 0) {
    return <EmptyPanel labels={labels.common} title={labels.common.emptyTitle} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.overview}
        lead={labels.common.overviewLead}
        source={labels.common.source}
      />
      <InfoGrid items={cards} />
      <div className="flex flex-wrap gap-2">
        {cards.map((card) => (
          <Button key={card.id} variant="secondary" size="sm" onClick={() => onNavigate(card.id)}>
            {card.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function resolveOptions(field, sources, labels) {
  const rows = sourceRows(sources[field.source]?.data);
  return rows
    .map((row) => ({
      value: nestedValue(row, field.valueKey || 'id'),
      label: displayValue(
        nestedValue(row, field.optionLabelKey || field.valueKey || 'id'),
        labels.locale,
        labels,
      ),
    }))
    .filter((option) => option.value !== undefined && option.value !== null && option.value !== '');
}

function cleanBody(body) {
  return Object.fromEntries(
    Object.entries(body).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  );
}

function buildBody(action, values) {
  switch (action.id) {
    case 'createListing':
      return {
        ...cleanBody(values),
        unitPrice: Number(values.unitPrice),
        quantityAvailable: Number(values.quantityAvailable),
        status: 'DRAFT',
        currency: 'BDT',
      };
    case 'checkout':
      return { referenceKey: values.referenceKey, pricingRules: [] };
    case 'addToCart':
      return { listingId: values.listingId, quantity: Number(values.quantity) };
    case 'updateShipmentStatus':
      return cleanBody({ status: values.status, note: values.note });
    case 'recordProof':
      return cleanBody({
        proofUrl: values.proofUrl,
        recipientName: values.recipientName,
        proofHash: values.proofHash,
        capturedAt: values.capturedAt,
      });
    case 'gradeInspection':
      return cleanBody({ gradeCode: values.gradeCode, gradeSource: 'INSPECTOR' });
    case 'verifyInspection':
    case 'rejectInspection':
      return cleanBody({ note: values.note });
    case 'inviteMember':
      return cleanBody({ email: values.email, roleCode: values.roleCode });
    default:
      return cleanBody(values);
  }
}

function interpolatePath(path, row, context) {
  return path.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) => {
    if (key === 'organizationId') return context.organizationId || '';
    return row?.[key] ?? '';
  });
}

function ActionButton({ action, row, sources, context, labels, onCompleted }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState({});

  const fields = useMemo(() => action.fields || [], [action.fields]);
  const canOpen = useMemo(() => {
    if (fields.some((field) => field.required && !values[field.key])) return false;
    return true;
  }, [fields, values]);

  const submit = useCallback(
    async (formValues) => {
      setSaving(true);
      try {
        const body = buildBody(action, formValues);
        await dashboardPost(interpolatePath(action.path, row, context), body);
        toast.success(labels.common.actionSuccess);
        setOpen(false);
        onCompleted();
      } catch (error) {
        toast.error(error?.message || labels.common.actionFailed);
      } finally {
        setSaving(false);
      }
    },
    [
      action,
      context,
      labels.common.actionFailed,
      labels.common.actionSuccess,
      onCompleted,
      row,
      toast,
    ],
  );

  const start = useCallback(() => {
    if (fields.length === 0) {
      void submit({});
      return;
    }
    const initial = {};
    for (const field of fields) {
      if (field.type === 'source') {
        const options = resolveOptions(field, sources, labels);
        initial[field.key] = options[0]?.value ?? '';
      } else {
        initial[field.key] =
          typeof field.defaultValue === 'function'
            ? field.defaultValue()
            : field.defaultValue || '';
      }
    }
    setValues(initial);
    setOpen(true);
  }, [fields, labels, sources, submit]);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={start} disabled={saving}>
        {labels.actions[action.labelKey] || action.labelKey}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={labels.actions[action.labelKey] || action.labelKey}
        description={labels.common.actionLead}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              {labels.common.cancel}
            </Button>
            <Button onClick={() => submit(values)} loading={saving} disabled={!canOpen}>
              {labels.common.confirm}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {fields.map((field) => {
            const fieldLabel = labels.fields[field.labelKey] || field.labelKey;
            if (field.type === 'source') {
              return (
                <Field key={field.key} label={fieldLabel}>
                  <Select
                    value={values[field.key] || ''}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.key]: event.target.value }))
                    }
                    options={resolveOptions(field, sources, labels)}
                  />
                </Field>
              );
            }
            if (field.type === 'select') {
              return (
                <Field key={field.key} label={fieldLabel}>
                  <Select
                    value={values[field.key] || ''}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.key]: event.target.value }))
                    }
                    options={(field.options || []).map((option) => ({
                      value: option,
                      label: option.replaceAll('_', ' '),
                    }))}
                  />
                </Field>
              );
            }
            return (
              <Field key={field.key} label={fieldLabel}>
                <Input
                  type={field.type === 'number' ? 'number' : 'text'}
                  min={field.min}
                  value={values[field.key] || ''}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                />
              </Field>
            );
          })}
        </div>
      </Modal>
    </>
  );
}

export function DataSection({ section, query, sources, session, labels, locale, onReload }) {
  const actions = useMemo(() => {
    if (!Array.isArray(section.actions)) return [];
    return section.actions
      .map((id) => {
        const action = (session?.actions || {})[id];
        return action ? { id, ...action } : null;
      })
      .filter(Boolean)
      .filter((action) => canAccess(session?.value, action.permission));
  }, [section.actions, session]);

  const rows = sourceRows(query?.data, section.arrayKey);
  const label = labels.sections[section.labelKey] || section.labelKey;
  const columns = useMemo(() => {
    const selected = section.columns
      ? section.columns.map((key) => ({
          id: key,
          label: labels.fields[key] || key.replace(/([A-Z])/g, ' $1'),
          render: (row) => displayValue(nestedValue(row, key), locale, labels),
        }))
      : autoColumns(rows, { ...labels, locale });
    if (actions.some((action) => action.row)) {
      return [
        ...selected,
        {
          id: 'actions',
          label: labels.common.actions,
          render: (row) => (
            <div className="flex flex-wrap gap-1">
              {actions
                .filter((action) => action.row)
                .map((action) => (
                  <ActionButton
                    key={action.id}
                    action={action}
                    row={row}
                    sources={sources}
                    context={{ organizationId: session?.value?.organizationId }}
                    labels={labels}
                    onCompleted={onReload}
                  />
                ))}
            </div>
          ),
        },
      ];
    }
    return selected;
  }, [actions, labels, locale, onReload, rows, section.columns, session, sources]);

  const panelLabels = {
    ...labels.common,
    loading: labels.common.loading,
    errorTitle: labels.common.errorTitle,
    retry: labels.common.retry,
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={label}
        lead={labels.leads[section.id] || labels.common.sectionLead}
        source={labels.common.source}
        actions={actions
          .filter((action) => !action.row)
          .map((action) => (
            <ActionButton
              key={action.id}
              action={action}
              row={null}
              sources={sources}
              context={{ organizationId: session?.value?.organizationId }}
              labels={labels}
              onCompleted={onReload}
            />
          ))}
      />
      <QueryPanel query={query || { status: 'idle' }} labels={panelLabels} title={label}>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>
              {labels.common.showing} {Math.min(rows.length, 50)} {labels.common.of} {rows.length}{' '}
              {labels.common.recordsReturned.toLowerCase()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              caption={label}
              columns={columns}
              rows={rows.slice(0, 50)}
              labels={panelLabels}
              emptyTitle={labels.common.emptyTitle}
            />
          </CardContent>
        </Card>
      </QueryPanel>
    </div>
  );
}

export function NotificationsSection({ query, labels }) {
  const panelLabels = {
    ...labels.common,
    loading: labels.common.loading,
    errorTitle: labels.common.errorTitle,
    retry: labels.common.retry,
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.notifications}
        lead={labels.common.notificationsLead}
        source={labels.common.source}
      />
      <div className="rounded-card border border-warning-border bg-warning-bg p-4 text-body-sm text-content">
        {labels.common.noPrivateFeed}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{labels.common.moduleInfo}</CardTitle>
          <CardDescription>{labels.common.source}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryPanel query={query || { status: 'idle' }} labels={panelLabels}>
            <RecordPairs record={query?.data} labels={labels.fields} />
          </QueryPanel>
        </CardContent>
      </Card>
    </div>
  );
}

export function ProfileSection({ labels, canManage }) {
  const toast = useToast();
  const [state, setState] = useState({
    status: 'loading',
    profile: null,
    roleProfiles: null,
    error: null,
  });
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, status: 'loading', error: null }));
    try {
      const [profile, roleProfiles] = await Promise.all([
        getUserProfile(),
        getRoleProfiles().catch(() => null),
      ]);
      setState({ status: 'success', profile, roleProfiles, error: null });
      setForm({
        firstName: profile?.firstName || '',
        lastName: profile?.lastName || '',
        nameBn: profile?.nameBn || '',
        preferredLanguage: profile?.preferredLanguage || '',
        defaultCurrency: profile?.defaultCurrency || '',
      });
    } catch (error) {
      setState({ status: 'error', profile: null, roleProfiles: null, error });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (event) => {
      event.preventDefault();
      setSaving(true);
      try {
        await updateUserProfile(cleanBody(form));
        await load();
        toast.success(labels.common.saved);
      } catch (error) {
        toast.error(error?.message || labels.common.actionFailed);
      } finally {
        setSaving(false);
      }
    },
    [form, labels.common.actionFailed, labels.common.saved, load, toast],
  );

  const panelLabels = {
    ...labels.common,
    loading: labels.common.loading,
    errorTitle: labels.common.errorTitle,
    retry: labels.common.retry,
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={labels.sections.profile}
        lead={labels.common.profileLead}
        source={labels.common.source}
      />
      <QueryPanel
        query={{ status: state.status, data: state.profile, error: state.error, reload: load }}
        labels={panelLabels}
      >
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{labels.common.profile}</CardTitle>
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
                }}
                labels={labels.fields}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                {(state.profile?.roleCodes || []).map((roleCode) => (
                  <Badge key={roleCode} tone="brand">
                    {roleCode}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{labels.common.roleProfiles}</CardTitle>
              <CardDescription>{labels.common.source}</CardDescription>
            </CardHeader>
            <CardContent>
              <RecordPairs record={state.roleProfiles} labels={labels.fields} />
            </CardContent>
          </Card>
          {canManage ? (
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>{labels.common.editProfile}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {['firstName', 'lastName', 'nameBn', 'preferredLanguage', 'defaultCurrency'].map(
                    (key) => (
                      <Field key={key} label={labels.fields[key] || key}>
                        <Input
                          value={form[key] || ''}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, [key]: event.target.value }))
                          }
                        />
                      </Field>
                    ),
                  )}
                  <div className="sm:col-span-2 xl:col-span-3">
                    <Button type="submit" loading={saving}>
                      {labels.common.save}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </QueryPanel>
    </div>
  );
}
