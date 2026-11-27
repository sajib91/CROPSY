'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { dashboardGet } from '@/lib/dashboard/client';
import { switchOrganization } from '@/lib/auth/client';
import { canAccess, hasAnyRole } from '@/lib/auth/roles';
import { useAuth } from '../auth/auth-provider';
import {
  Badge,
  BellIcon,
  Button,
  EmptyState,
  Field,
  LayoutDashboardIcon,
  LeafIcon,
  LoadingState,
  PackageIcon,
  SearchIcon,
  Select,
  SettingsIcon,
  UsersIcon,
  useToast,
  cn,
} from '../ui';
import {
  DataSection,
  NotificationsSection,
  OverviewSection,
  ProfileSection,
} from './role-dashboard-sections';

const ICONS = {
  overview: LayoutDashboardIcon,
  marketplace: SearchIcon,
  favorites: PackageIcon,
  cart: PackageIcon,
  checkouts: PackageIcon,
  orders: PackageIcon,
  shipments: PackageIcon,
  deliveries: PackageIcon,
  warehouse: PackageIcon,
  quality: BellIcon,
  traceability: LeafIcon,
  organizations: UsersIcon,
  notifications: BellIcon,
  profile: SettingsIcon,
};

function interpolate(value, session) {
  if (typeof value !== 'string') return value;
  return value
    .replaceAll('{userId}', session?.user?.id || '')
    .replaceAll('{organizationId}', session?.organizationId || '');
}

function resolveParams(params, session) {
  return Object.fromEntries(
    Object.entries(params || {}).map(([key, value]) => [key, interpolate(value, session)]),
  );
}

function useDashboardSources(sections, session) {
  const serialized = JSON.stringify(
    sections.map((section) => ({
      id: section.id,
      endpoint: section.endpoint,
      params: resolveParams(section.params, session),
    })),
  );

  const loadSection = useCallback(
    async (section) => {
      if (!section.endpoint) return { status: 'idle', data: null, error: null };
      if (
        section.endpoint.includes('{organizationId}') &&
        !session?.organizationId &&
        !session?.isSuperAdmin
      ) {
        return { status: 'idle', data: null, error: null };
      }
      try {
        const data = await dashboardGet(
          interpolate(section.endpoint, session),
          resolveParams(section.params, session),
        );
        return { status: 'success', data, error: null };
      } catch (error) {
        return { status: 'error', data: null, error };
      }
    },
    [session],
  );

  const [sources, setSources] = useState({});

  useEffect(() => {
    let active = true;
    const parsed = JSON.parse(serialized);
    setSources(
      Object.fromEntries(
        parsed.map((item) => [item.id, { status: 'loading', data: null, error: null }]),
      ),
    );
    for (const item of parsed) {
      const section = sections.find((candidate) => candidate.id === item.id);
      if (!section) continue;
      loadSection(section).then((result) => {
        if (active) setSources((current) => ({ ...current, [section.id]: result }));
      });
    }
    return () => {
      active = false;
    };
  }, [loadSection, sections, serialized]);

  const reload = useCallback(
    async (id) => {
      const section = sections.find((candidate) => candidate.id === id);
      if (!section) return;
      setSources((current) => ({
        ...current,
        [id]: { status: 'loading', data: null, error: null },
      }));
      const result = await loadSection(section);
      setSources((current) => ({ ...current, [id]: result }));
    },
    [loadSection, sections],
  );

  return { sources, reload };
}

function OrganizationSwitcher({ session, refreshSession, labels }) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const organizations = Array.isArray(session?.organizations) ? session.organizations : [];
  const active = organizations.find((item) => item.id === session?.organizationId);

  const change = useCallback(
    async (event) => {
      const organizationId = event.target.value;
      setPending(true);
      try {
        await switchOrganization(organizationId);
        await refreshSession();
        toast.success(labels.organizationChanged);
      } catch (error) {
        toast.error(error?.message || labels.organizationFailed);
      } finally {
        setPending(false);
      }
    },
    [labels.organizationChanged, labels.organizationFailed, refreshSession, toast],
  );

  if (organizations.length === 0) return null;
  if (organizations.length === 1) {
    return (
      <Badge tone="brand">
        {labels.activeOrganization}: {active?.name || active?.id || session?.organizationId}
      </Badge>
    );
  }

  return (
    <Field label={labels.activeOrganization} className="min-w-56">
      <Select
        value={session?.organizationId || ''}
        onChange={change}
        disabled={pending}
        options={organizations.map((organization) => ({
          value: organization.id,
          label: organization.name || organization.id,
        }))}
      />
    </Field>
  );
}

function DashboardBody({ locale, dictionary, page, config, session, refreshSession }) {
  const labels = dictionary.workspaces;
  const allowedSections = useMemo(() => {
    const hasOrganizationContext = Boolean(session?.organizationId || session?.isSuperAdmin);
    return config.sections.filter(
      (section) =>
        canAccess(session, section.permissions) &&
        (!section.requiresOrganization || hasOrganizationContext),
    );
  }, [config.sections, session]);
  const { sources, reload } = useDashboardSources(allowedSections, session);
  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const readHash = () => window.location.hash.replace('#', '');
    const initial = readHash();
    if (initial && allowedSections.some((section) => section.id === initial)) {
      setActiveSection(initial);
    }
    const onHashChange = () => {
      const next = readHash();
      if (next && allowedSections.some((section) => section.id === next)) setActiveSection(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [allowedSections]);

  useEffect(() => {
    if (
      !allowedSections.some((section) => section.id === activeSection) &&
      allowedSections.length > 0
    ) {
      setActiveSection(allowedSections[0].id);
    }
  }, [activeSection, allowedSections]);

  const selectSection = useCallback((id) => {
    setActiveSection(id);
    if (typeof window !== 'undefined') window.history.replaceState(null, '', `#${id}`);
  }, []);

  if (allowedSections.length === 0) {
    return (
      <EmptyState
        title={labels.access.noSectionsTitle}
        description={labels.access.noSectionsLead}
      />
    );
  }

  const current =
    allowedSections.find((section) => section.id === activeSection) || allowedSections[0];
  const sectionSession = { value: session, actions: config.actions };

  function renderSection() {
    if (current.kind === 'overview') {
      return (
        <OverviewSection
          config={{ sections: allowedSections }}
          sources={sources}
          labels={labels}
          locale={locale}
          onNavigate={selectSection}
        />
      );
    }
    if (current.kind === 'profile') {
      return <ProfileSection labels={labels} canManage={canAccess(session, 'profile.manage')} />;
    }
    if (current.kind === 'notifications') {
      return <NotificationsSection query={sources[current.id]} labels={labels} />;
    }
    return (
      <DataSection
        section={current}
        query={sources[current.id]}
        sources={sources}
        session={sectionSession}
        labels={labels}
        locale={locale}
        onReload={() => reload(current.id)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-[1600px] px-page py-section">
        <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-overline font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
              {page.eyebrow}
            </p>
            <h1 className="mt-2 text-display font-bold text-content">{page.title}</h1>
            <p className="mt-2 max-w-3xl text-body text-content-muted">{page.lead}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
            <OrganizationSwitcher
              session={session}
              refreshSession={refreshSession}
              labels={labels.common}
            />
            <div className="flex flex-wrap gap-2">
              {(session?.roles || []).map((role) => (
                <Badge key={`${role.code}-${role.organizationId || 'global'}`} tone="neutral">
                  {role.code}
                </Badge>
              ))}
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <nav aria-label={labels.aria.navigation} className="lg:sticky lg:top-4 lg:self-start">
            <div className="flex gap-2 overflow-x-auto rounded-card border border-line bg-surface p-2 lg:flex-col lg:overflow-visible">
              {allowedSections.map((section) => {
                const Icon = ICONS[section.labelKey] || ICONS[section.id] || LayoutDashboardIcon;
                const active = section.id === current.id;
                return (
                  <Button
                    key={section.id}
                    variant={active ? 'secondary' : 'ghost'}
                    size="sm"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => selectSection(section.id)}
                    className={cn('shrink-0 justify-start', active && 'font-semibold')}
                    leadingIcon={<Icon className="h-4 w-4" />}
                  >
                    {labels.sections[section.labelKey] || section.labelKey}
                  </Button>
                );
              })}
            </div>
          </nav>

          <section aria-label={labels.aria.region} className="min-w-0">
            {renderSection()}
          </section>
        </div>
      </div>
    </div>
  );
}

export function RoleDashboard({ locale, dictionary, page, config }) {
  const { session, status, refreshSession } = useAuth();

  if (status === 'loading') {
    return <LoadingState label={dictionary.dashboard.common.loading} />;
  }
  if (!hasAnyRole(session, config.roleCodes)) {
    return (
      <EmptyState
        title={dictionary.workspaces.access.wrongRoleTitle}
        description={dictionary.workspaces.access.wrongRoleLead}
      />
    );
  }

  return (
    <DashboardBody
      locale={locale}
      dictionary={dictionary}
      page={page}
      config={config}
      session={session}
      refreshSession={refreshSession}
    />
  );
}
