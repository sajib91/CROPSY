'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  BellIcon,
  EmptyState,
  InfoIcon,
  LayoutDashboardIcon,
  LeafIcon,
  LoadingState,
  PackageIcon,
  SearchIcon,
  SettingsIcon,
  TrendingUpIcon,
  cn,
} from '../ui';
import { useAuth } from '../auth/auth-provider';
import { useDashboardQuery } from './dashboard-primitives';
import {
  ActivitiesSection,
  CalendarSection,
  CropsSection,
  ExpensesSection,
  FarmsSection,
  HarvestsSection,
  LandSection,
  OverviewSection,
} from './dashboard-sections-a';
import {
  AssistantSection,
  EarningsSection,
  InventorySection,
  ListingsSection,
  MarketSection,
  NotificationsSection,
  OrdersSection,
  SettingsSection,
  WeatherSection,
} from './dashboard-sections-b';

const SECTIONS = [
  { id: 'overview', permission: null, icon: LayoutDashboardIcon },
  { id: 'farms', permission: 'farms.read', icon: LeafIcon },
  { id: 'land', permission: 'farms.read', icon: LeafIcon },
  { id: 'crops', permission: 'cultivations.read', icon: LeafIcon },
  { id: 'calendar', permission: 'crops.read', icon: LeafIcon },
  { id: 'activities', permission: 'cultivations.read', icon: LeafIcon },
  { id: 'expenses', permission: 'expenses.read', icon: TrendingUpIcon },
  { id: 'harvests', permission: 'harvests.read', icon: PackageIcon },
  { id: 'inventory', permission: 'listings.read', icon: PackageIcon },
  { id: 'listings', permission: 'listings.read', icon: PackageIcon },
  { id: 'orders', permission: 'orders.read', icon: PackageIcon },
  { id: 'earnings', permission: 'farms.read', icon: TrendingUpIcon },
  { id: 'market', permissions: ['listings.read', 'ai.read'], icon: SearchIcon },
  { id: 'weather', permission: 'ai.read', icon: InfoIcon },
  { id: 'assistant', permission: 'ai.read', icon: InfoIcon },
  { id: 'notifications', permission: 'notifications.read', icon: BellIcon },
  { id: 'settings', permission: 'profile.read', icon: SettingsIcon },
];

function sectionAllowed(section, session) {
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const candidates = section.permissions || (section.permission ? [section.permission] : []);
  if (candidates.length === 0) return true;
  if (session?.isSuperAdmin) return true;
  if (permissions.length === 0) return true;
  return candidates.some((permission) => permissions.includes(permission));
}

export function FarmerDashboard({ locale, dictionary, page }) {
  const { session, status } = useAuth();
  const [activeSection, setActiveSection] = useState('overview');
  const [selectedFarmId, setSelectedFarmId] = useState('');
  const farms = useDashboardQuery('/farmers/farms', { includeArchived: false });

  const allowedSections = useMemo(
    () => SECTIONS.filter((section) => sectionAllowed(section, session)),
    [session],
  );

  useEffect(() => {
    const hash = typeof window === 'undefined' ? '' : window.location.hash.replace('#', '');
    if (hash && SECTIONS.some((section) => section.id === hash)) setActiveSection(hash);
    const onHashChange = () => {
      const next = window.location.hash.replace('#', '');
      if (next && SECTIONS.some((section) => section.id === next)) setActiveSection(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (
      !allowedSections.some((section) => section.id === activeSection) &&
      allowedSections.length > 0
    ) {
      setActiveSection(allowedSections[0].id);
    }
  }, [activeSection, allowedSections]);

  useEffect(() => {
    if (!selectedFarmId && farms.data?.farms?.length) {
      setSelectedFarmId(farms.data.farms[0].id);
    }
  }, [farms.data, selectedFarmId]);

  const selectSection = useCallback((id) => {
    setActiveSection(id);
    if (typeof window !== 'undefined') window.history.replaceState(null, '', `#${id}`);
  }, []);

  if (status === 'loading') return <LoadingState label={dictionary.common.loading} />;

  const isFarmer = !!session?.roles?.some((role) => role.code === 'FARMER');
  if (!isFarmer) {
    return (
      <EmptyState
        title={dictionary.common.notFarmerTitle}
        description={dictionary.common.notFarmerLead}
      />
    );
  }

  const commonProps = { locale, labels: dictionary, selectedFarmId, user: session?.user };
  const sectionProps = { ...commonProps, farms, onSelectFarm: setSelectedFarmId };

  function renderSection() {
    switch (activeSection) {
      case 'farms':
        return <FarmsSection {...sectionProps} />;
      case 'land':
        return <LandSection {...sectionProps} />;
      case 'crops':
        return <CropsSection {...sectionProps} />;
      case 'calendar':
        return <CalendarSection {...sectionProps} />;
      case 'activities':
        return <ActivitiesSection {...sectionProps} />;
      case 'expenses':
        return <ExpensesSection {...sectionProps} />;
      case 'harvests':
        return <HarvestsSection {...sectionProps} />;
      case 'inventory':
        return <InventorySection {...commonProps} />;
      case 'listings':
        return <ListingsSection {...commonProps} />;
      case 'orders':
        return <OrdersSection {...commonProps} />;
      case 'earnings':
        return <EarningsSection {...commonProps} />;
      case 'market':
        return <MarketSection {...commonProps} />;
      case 'weather':
        return <WeatherSection {...commonProps} />;
      case 'assistant':
        return <AssistantSection {...commonProps} />;
      case 'notifications':
        return <NotificationsSection labels={dictionary} />;
      case 'settings':
        return <SettingsSection {...commonProps} />;
      case 'overview':
      default:
        return <OverviewSection {...sectionProps} onNavigate={selectSection} />;
    }
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
          <div className="flex flex-wrap items-center gap-2">
            {(session?.roles || []).map((role) => (
              <Badge key={`${role.code}-${role.organizationId || ''}`} tone="brand">
                {role.code}
              </Badge>
            ))}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav aria-label={dictionary.aria.navigation} className="lg:sticky lg:top-4 lg:self-start">
            <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
              {allowedSections.map((section) => {
                const Icon = section.icon;
                const active = section.id === activeSection;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => selectSection(section.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex shrink-0 items-center gap-2 rounded-control border px-3 py-2 text-left text-body-sm transition-colors focus-ring',
                      active
                        ? 'border-brand-600 bg-brand-50 font-semibold text-brand-800 dark:bg-brand-950/50 dark:text-brand-200'
                        : 'border-line bg-surface text-content-muted hover:border-line-strong hover:text-content',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{dictionary.sections[section.id]}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <section aria-label={dictionary.aria.region} className="min-w-0">
            {renderSection()}
          </section>
        </div>
      </div>
    </div>
  );
}
