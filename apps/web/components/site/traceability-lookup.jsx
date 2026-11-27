'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  InlineError,
  Input,
  LoadingState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui';

const TIMEOUT_MS = 8000;

function formatDate(value) {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

function statusTone(status) {
  if (status === 'VERIFIED') return 'success';
  if (status === 'REJECTED') return 'danger';
  return 'warning';
}

export function TraceabilityLookup({ dictionary, apiUrl }) {
  const labels = dictionary.verification;
  const [token, setToken] = useState('');
  const [state, setState] = useState({ status: 'idle' });
  const controllerRef = useRef(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function handleSubmit(event) {
    event.preventDefault();
    const value = token.trim();

    if (!value) {
      setState({ status: 'error', message: labels.invalid });
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, TIMEOUT_MS);
    setState({ status: 'loading' });

    try {
      const response = await fetch(
        `${apiUrl.replace(/\/$/, '')}/traceability/verify/${encodeURIComponent(value)}`,
        { cache: 'no-store', signal: controller.signal, headers: { accept: 'application/json' } },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (!body?.success || !body.data) throw new Error(body?.error || 'Invalid API response');
      setState({ status: 'result', data: body.data });
    } catch (error) {
      if (error?.name === 'AbortError') {
        if (timedOut) setState({ status: 'error', message: labels.networkError });
        return;
      }
      setState({ status: 'error', message: labels.networkError });
    } finally {
      clearTimeout(timeout);
    }
  }

  const data = state.status === 'result' ? state.data : null;
  const facts = Array.isArray(data?.facts)
    ? data.facts.filter((fact) => fact && typeof fact === 'object')
    : [];
  const verifiedAt = formatDate(data?.verifiedAt);
  const status = data?.verificationStatus ?? 'UNVERIFIED';

  return (
    <section id="verify" className="scroll-mt-24">
      <Card>
        <CardHeader>
          <CardTitle>{labels.title}</CardTitle>
          <CardDescription>{labels.lead}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <Field label={labels.tokenLabel} className="flex-1">
              <Input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={labels.tokenPlaceholder}
                autoComplete="off"
              />
            </Field>
            <Button type="submit" loading={state.status === 'loading'} loadingText={labels.button}>
              {labels.button}
            </Button>
          </form>

          <div aria-live="polite" className="flex flex-col gap-4">
            {state.status === 'loading' ? <LoadingState label={labels.loading} /> : null}
            {state.status === 'error' ? (
              <InlineError title={labels.errorTitle} description={state.message} />
            ) : null}
            {data ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-subheading font-semibold">{labels.resultTitle}</h3>
                  <Badge tone={statusTone(status)} dot>
                    {status}
                  </Badge>
                </div>
                <dl className="grid gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1 rounded-control border border-line bg-surface-muted p-3">
                    <dt className="text-caption font-semibold uppercase tracking-wider text-content-subtle">
                      {labels.batchCode}
                    </dt>
                    <dd className="break-all font-mono text-body-sm">{data.batchCode || '—'}</dd>
                  </div>
                  <div className="flex flex-col gap-1 rounded-control border border-line bg-surface-muted p-3">
                    <dt className="text-caption font-semibold uppercase tracking-wider text-content-subtle">
                      {labels.status}
                    </dt>
                    <dd className="font-mono text-body-sm">{status}</dd>
                  </div>
                  <div className="flex flex-col gap-1 rounded-control border border-line bg-surface-muted p-3">
                    <dt className="text-caption font-semibold uppercase tracking-wider text-content-subtle">
                      {labels.verifiedAt}
                    </dt>
                    <dd className="font-mono text-body-sm">{verifiedAt || '—'}</dd>
                  </div>
                </dl>
                {data.notice ? (
                  <p className="rounded-control border border-warning-border bg-warning-bg p-3 text-body-sm text-content">
                    {data.notice}
                  </p>
                ) : null}
                <h4 className="text-body-sm font-semibold">{labels.factsTitle}</h4>
                {facts.length > 0 ? (
                  <Table caption={labels.factsTitle} dense>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{labels.factTitle}</TableHead>
                        <TableHead>{labels.factType}</TableHead>
                        <TableHead>{labels.factOccurredAt}</TableHead>
                        <TableHead>{labels.factDescription}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {facts.map((fact, index) => (
                        <TableRow key={`${fact.occurredAt ?? 'date'}-${index}`}>
                          <TableCell className="font-medium">{fact.title || '—'}</TableCell>
                          <TableCell className="font-mono text-caption">
                            {fact.eventType || '—'}
                          </TableCell>
                          <TableCell className="font-mono text-caption">
                            {formatDate(fact.occurredAt) || '—'}
                          </TableCell>
                          <TableCell>{fact.description || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState compact title={labels.noFacts} />
                )}
                <p className="text-caption text-content-subtle">
                  {data.disclaimer || labels.disclaimer}
                </p>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
