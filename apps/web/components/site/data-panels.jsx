import { unstable_noStore as noStore } from 'next/cache';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  InlineError,
  SkeletonText,
} from '../ui';
import { getApiHealth, getApiVersion, getModuleInfo, getPublicModules } from '@/lib/platform-api';

export function DataPanelFallback({ label }) {
  return (
    <Card aria-busy="true">
      <CardHeader className="border-none pb-2">
        <CardTitle>{label}</CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <SkeletonText lines={4} />
      </CardContent>
    </Card>
  );
}

export async function ApiStatusPanel({ dictionary }) {
  noStore();
  const [healthResult, versionResult] = await Promise.all([getApiHealth(), getApiVersion()]);

  if (!healthResult.ok || !versionResult.ok) {
    return (
      <InlineError
        title={dictionary.data.healthError}
        description={healthResult.error ?? versionResult.error}
      />
    );
  }

  const health = healthResult.data ?? {};
  const version = versionResult.data ?? {};
  const isHealthy = health.status === 'ok' || health.status === 'ready';

  return (
    <Card>
      <CardHeader className="border-none pb-2">
        <CardTitle className="flex items-center gap-2">
          {dictionary.pages.home.statusTitle}
          <Badge tone={isHealthy ? 'success' : 'warning'} dot>
            {isHealthy ? dictionary.common.live : dictionary.data.status}
          </Badge>
        </CardTitle>
        <CardDescription>{dictionary.pages.home.statusLead}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            [dictionary.data.service, health.service],
            [dictionary.data.status, health.status],
            [dictionary.data.apiVersion, version.version],
            [dictionary.data.supportedVersions, (version.supportedVersions ?? []).join(', ')],
            [dictionary.data.timestamp, health.timestamp],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1">
                <dt className="text-caption font-semibold uppercase tracking-wider text-content-subtle">
                  {label}
                </dt>
                <dd className="break-words font-mono text-body-sm text-content">{String(value)}</dd>
              </div>
            ))}
        </dl>
        <p className="mt-4 text-caption text-content-subtle">{dictionary.data.source}</p>
      </CardContent>
    </Card>
  );
}

export async function ModuleDirectoryPanel({ dictionary, title, description, filterIds, limit }) {
  noStore();
  const result = await getPublicModules();

  if (!result.ok) {
    return <InlineError title={dictionary.data.moduleError} description={result.error} />;
  }

  const allModules = Array.isArray(result.data) ? result.data : [];
  const filtered = filterIds?.length
    ? allModules.filter((module) => filterIds.includes(module.id))
    : allModules;
  const visible = limit ? filtered.slice(0, limit) : filtered;
  const total = result.meta?.count ?? allModules.length;

  return (
    <Card>
      <CardHeader className="border-none pb-2">
        <CardTitle>{title ?? dictionary.pages.home.modulesTitle}</CardTitle>
        <CardDescription>{description ?? dictionary.pages.home.modulesLead}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-caption text-content-subtle">
          {dictionary.data.modules}: {total}
        </p>
        {visible.length === 0 ? (
          <p className="text-body-sm text-content-muted">{dictionary.common.noPublicData}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {visible.map((module) => (
              <li
                key={module.id}
                className="flex flex-col gap-1 rounded-control border border-line bg-surface-muted p-4"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-body-sm font-semibold text-content">{module.name}</span>
                  <code className="rounded-xs bg-surface px-1.5 py-0.5 font-mono text-caption text-content-subtle">
                    {module.id}
                  </code>
                </span>
                <span className="text-caption text-content-muted">{module.description}</span>
                <span className="font-mono text-caption text-content-subtle">{module.path}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export async function ModuleInfoCallout({ moduleId, dictionary }) {
  noStore();
  const result = await getModuleInfo(moduleId);

  if (!result.ok) {
    return <InlineError title={dictionary.data.moduleInfoError} description={result.error} />;
  }

  const info = result.data ?? {};

  return (
    <Card>
      <CardHeader className="border-none pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2">
          {info.name ?? moduleId}
          {info.status ? <Badge tone="success">{info.status}</Badge> : null}
        </CardTitle>
        <CardDescription>{info.description ?? dictionary.data.source}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-3">
          {[
            [dictionary.data.path, info.path],
            [dictionary.data.status, info.status],
            [dictionary.data.moduleId, info.moduleId],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1">
                <dt className="text-caption font-semibold uppercase tracking-wider text-content-subtle">
                  {label}
                </dt>
                <dd className="break-words font-mono text-body-sm text-content">{String(value)}</dd>
              </div>
            ))}
        </dl>
      </CardContent>
    </Card>
  );
}
