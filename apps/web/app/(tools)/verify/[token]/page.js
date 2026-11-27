import { getWebEnv } from '@/lib/env';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

const FALLBACK_NOTICE = 'No verified public facts are available for this code.';
const FALLBACK_DISCLAIMER = 'Unverified claims are not represented as certified.';

function formatDate(value) {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

export default async function VerifyPage({ params }) {
  const { token } = await params;
  const { NEXT_PUBLIC_API_URL } = getWebEnv();

  let payload = null;
  try {
    const response = await fetch(
      `${NEXT_PUBLIC_API_URL}/traceability/verify/${encodeURIComponent(token || '')}`,
      { cache: 'no-store' },
    );
    if (response.ok) {
      const body = await response.json();
      if (body?.success && body.data && typeof body.data === 'object') {
        payload = body.data;
      }
    }
  } catch {
    // Missing or unreachable data is handled by the unverified fallback below.
  }

  const batchCode =
    typeof payload?.batchCode === 'string' && payload.batchCode.trim() ? payload.batchCode : null;
  const verificationStatus =
    typeof payload?.verificationStatus === 'string' && payload.verificationStatus
      ? payload.verificationStatus
      : 'UNVERIFIED';
  const disclaimer =
    typeof payload?.disclaimer === 'string' && payload.disclaimer
      ? payload.disclaimer
      : FALLBACK_DISCLAIMER;
  const notice = typeof payload?.notice === 'string' && payload.notice ? payload.notice : null;
  const verifiedAt = formatDate(payload?.verifiedAt);
  const facts = Array.isArray(payload?.facts)
    ? payload.facts.filter((fact) => fact && typeof fact === 'object')
    : [];

  const statusTone =
    verificationStatus === 'VERIFIED'
      ? 'success'
      : verificationStatus === 'REJECTED'
        ? 'danger'
        : 'warning';

  return (
    <main id="main-content" className="mx-auto max-w-5xl px-page py-section">
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-3">
          <Badge tone="brand" dot>
            Product verification
          </Badge>
          <h1 className="text-title font-bold">Chain of custody</h1>
          <p className="max-w-2xl text-body text-content-muted">
            Public facts are shown only when the API returns verified data. Unverified claims are
            never presented as certified.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Batch details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <dt className="text-caption font-semibold uppercase tracking-wider text-content-muted">
                  Batch code
                </dt>
                <dd className="break-all font-mono text-body-sm text-content">
                  {batchCode || 'Unavailable'}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-caption font-semibold uppercase tracking-wider text-content-muted">
                  Verification status
                </dt>
                <dd>
                  <Badge tone={statusTone}>{verificationStatus}</Badge>
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-caption font-semibold uppercase tracking-wider text-content-muted">
                  Verified at
                </dt>
                <dd className="font-mono text-body-sm text-content">
                  {verifiedAt || 'Not recorded'}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {(notice || facts.length === 0) && (
          <Card className="border-warning-border bg-warning-bg shadow-none">
            <CardContent className="py-4">
              <p className="text-body-sm text-content">{notice || FALLBACK_NOTICE}</p>
            </CardContent>
          </Card>
        )}

        <section className="flex flex-col gap-4">
          <h2 className="text-heading font-semibold">Public facts</h2>
          {facts.length > 0 ? (
            <Table caption="Verified public events for this batch">
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Occurred at</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {facts.map((fact, index) => {
                  const occurredAt = formatDate(fact.occurredAt);
                  const title =
                    typeof fact.title === 'string' && fact.title.trim()
                      ? fact.title
                      : 'Verified event';
                  const description =
                    typeof fact.description === 'string' && fact.description.trim()
                      ? fact.description
                      : '—';

                  return (
                    <TableRow key={`${occurredAt || 'date'}-${index}`}>
                      <TableCell className="font-medium">{title}</TableCell>
                      <TableCell className="font-mono text-caption text-content-muted">
                        {occurredAt || '—'}
                      </TableCell>
                      <TableCell>{description}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No public facts to display"
              description="This code has no verified public events available."
            />
          )}
        </section>

        <p className="text-caption text-content-subtle">{disclaimer}</p>
      </div>
    </main>
  );
}
