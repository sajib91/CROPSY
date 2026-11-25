import { getWebEnv } from '../lib/env';

export default function HomePage() {
  const { NEXT_PUBLIC_API_URL } = getWebEnv();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
        Foundation ready
      </p>
      <h1 className="mt-4 text-4xl font-semibold">CROPSY</h1>
      <p className="mt-4 max-w-xl text-slate-300">
        The web workspace is configured. Health checks are available and no business features have
        been implemented yet.
      </p>
      <dl className="mt-8 grid gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-slate-400">API base URL</dt>
          <dd className="font-mono text-emerald-300">{NEXT_PUBLIC_API_URL}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-slate-400">Health endpoint</dt>
          <dd className="font-mono text-emerald-300">/health</dd>
        </div>
      </dl>
    </main>
  );
}
