'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { dashboardGet } from '@/lib/dashboard/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '../ui';

export function useDashboardQuery(path, params = {}, { enabled = true } = {}) {
  const serializedParams = JSON.stringify(params);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState({
    status: enabled ? 'loading' : 'idle',
    data: null,
    error: null,
  });

  const load = useCallback(async () => {
    void nonce;
    if (!enabled) {
      setState({ status: 'idle', data: null, error: null });
      return;
    }
    setState((current) => ({ ...current, status: 'loading', error: null }));
    try {
      const data = await dashboardGet(path, JSON.parse(serializedParams));
      setState({ status: 'success', data, error: null });
    } catch (error) {
      setState({ status: 'error', data: null, error });
    }
  }, [enabled, nonce, path, serializedParams]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: () => setNonce((value) => value + 1) };
}

export function SectionHeader({ title, lead, source, actions }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        <h2 className="text-heading font-semibold text-content">{title}</h2>
        {lead ? <p className="mt-1 text-body-sm text-content-muted">{lead}</p> : null}
        {source ? <p className="mt-1 text-caption text-content-subtle">{source}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function QueryPanel({ query, labels, title, children }) {
  if (query.status === 'idle') {
    return (
      <EmptyState
        title={title || labels.emptyTitle}
        description={labels.noFarmLead || labels.emptyDescription}
      />
    );
  }
  if (query.status === 'loading') return <LoadingState label={labels.loading} />;
  if (query.status === 'error') {
    return (
      <ErrorState
        title={labels.errorTitle}
        description={query.error?.message || labels.emptyDescription}
        retryLabel={labels.retry}
        onRetry={query.reload}
      />
    );
  }
  return children;
}

export function EmptyPanel({ labels, title, description, action }) {
  return (
    <EmptyState
      title={title || labels.emptyTitle}
      description={description || labels.emptyDescription}
      actions={action}
    />
  );
}

export function DataTable({ caption, columns, rows, labels, emptyTitle }) {
  if (!rows || rows.length === 0) return <EmptyPanel labels={labels} title={emptyTitle} />;

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <Table caption={caption}>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.id} scope="col">
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.id ?? index}>
              {columns.map((column) => (
                <TableCell key={column.id}>{column.render(row)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function FilterBar({ title, children, className }) {
  return (
    <section
      aria-label={title}
      className={cn(
        'mb-5 grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-2 xl:grid-cols-4',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function FilterSelect({ id, label, value, onChange, options, allLabel }) {
  const normalized = options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  );
  return (
    <Field label={label}>
      <Select
        id={id}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        options={[
          { value: '', label: allLabel },
          ...normalized.filter((option) => option.value !== ''),
        ]}
      />
    </Field>
  );
}

export function FilterInput({ id, label, value, onChange, type = 'text', placeholder }) {
  return (
    <Field label={label}>
      <Input
        id={id}
        type={type}
        value={value || ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

export function InfoGrid({ items, columns = 'sm:grid-cols-2 xl:grid-cols-4' }) {
  return (
    <div className={cn('grid gap-4', columns)}>
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="border-none pb-2">
            <CardDescription>{item.label}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-subheading font-semibold text-content">{item.value}</p>
            {item.helper ? (
              <p className="mt-1 text-caption text-content-muted">{item.helper}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function RecordPairs({ record, labels, title }) {
  const entries = useMemo(() => {
    if (!record || typeof record !== 'object') return [];
    return Object.entries(record)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => ({
        id: key,
        label: labels[key] || key.replace(/([A-Z])/g, ' $1'),
        value:
          typeof value === 'object'
            ? JSON.stringify(value)
            : typeof value === 'boolean'
              ? String(value)
              : String(value),
      }));
  }, [labels, record]);

  if (entries.length === 0) return <EmptyPanel labels={labels} title={title} />;

  return (
    <div className="rounded-card border border-line bg-surface">
      <dl className="divide-y divide-line">
        {entries.map((entry) => (
          <div key={entry.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:justify-between">
            <dt className="text-body-sm text-content-muted">{entry.label}</dt>
            <dd className="break-words text-body-sm font-medium text-content">{entry.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ItemList({ items, labels, title, renderItem }) {
  if (!items || items.length === 0) return <EmptyPanel labels={labels} title={title} />;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {items.map((item, index) => (
        <li key={item?.id || index} className="p-4 text-body-sm text-content">
          {renderItem ? renderItem(item) : <RecordPairs record={item} labels={labels} />}
        </li>
      ))}
    </ul>
  );
}
