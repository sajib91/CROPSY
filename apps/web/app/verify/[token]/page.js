import { getWebEnv } from '../../../lib/env';

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

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-12">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
        Product verification
      </p>
      <h1 className="mt-4 text-3xl font-semibold">Chain of custody</h1>

      <dl className="mt-8 grid gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-slate-400">Batch code</dt>
          <dd className="font-mono text-emerald-300">{batchCode || 'Unavailable'}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-slate-400">Verification status</dt>
          <dd className="font-mono text-emerald-300">{verificationStatus}</dd>
        </div>
        {verifiedAt ? (
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-slate-400">Verified at</dt>
            <dd className="font-mono text-emerald-300">{verifiedAt}</dd>
          </div>
        ) : null}
      </dl>

      {(notice || facts.length === 0) && (
        <p className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
          {notice || FALLBACK_NOTICE}
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Public facts</h2>
        {facts.length > 0 ? (
          <ol className="mt-4 space-y-3">
            {facts.map((fact, index) => {
              const occurredAt = formatDate(fact.occurredAt);
              const title =
                typeof fact.title === 'string' && fact.title.trim() ? fact.title : 'Verified event';
              const description =
                typeof fact.description === 'string' && fact.description.trim()
                  ? fact.description
                  : null;

              return (
                <li
                  key={`${occurredAt || 'date'}-${index}`}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
                >
                  <p className="text-sm font-medium text-emerald-300">{title}</p>
                  {occurredAt ? (
                    <p className="mt-1 font-mono text-xs text-slate-400">{occurredAt}</p>
                  ) : null}
                  {description ? (
                    <p className="mt-2 text-sm text-slate-300">{description}</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-4 text-sm text-slate-400">No public facts to display.</p>
        )}
      </section>

      <p className="mt-10 text-xs text-slate-400">{disclaimer}</p>
    </main>
  );
}
