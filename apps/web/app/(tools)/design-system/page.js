'use client';

import { useState } from 'react';
import {
  ActivityFeed,
  Badge,
  BarChart,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartCard,
  Checkbox,
  DashboardGrid,
  DonutChart,
  Dropdown,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  Input,
  LineChart,
  LoadingOverlay,
  LoadingState,
  Modal,
  NavLink,
  Navbar,
  PackageIcon,
  PlusIcon,
  ProgressWidget,
  QuickActions,
  Radio,
  SelectField,
  SidebarLink,
  SkeletonText,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  ThemeToggle,
  buttonStyles,
  cn,
  useToast,
} from '@/components/ui';

const navLinks = [
  { label: 'Overview', href: '/design-system' },
  { label: 'Verification', href: '/verify/demo-batch' },
];

const colorTokens = [
  { label: 'brand-700', className: 'bg-brand-700' },
  { label: 'brand-500', className: 'bg-brand-500' },
  { label: 'canvas', className: 'bg-canvas' },
  { label: 'surface', className: 'bg-surface' },
  { label: 'content', className: 'bg-content' },
  { label: 'line', className: 'bg-line' },
  { label: 'success', className: 'bg-success' },
  { label: 'warning', className: 'bg-warning' },
  { label: 'danger', className: 'bg-danger' },
  { label: 'info', className: 'bg-info' },
];

const radii = [
  { label: 'xs', className: 'rounded-xs' },
  { label: 'control', className: 'rounded-control' },
  { label: 'card', className: 'rounded-card' },
  { label: 'panel', className: 'rounded-panel' },
  { label: 'pill', className: 'rounded-pill' },
];

const shadows = [
  { label: 'card', className: 'shadow-card' },
  { label: 'raised', className: 'shadow-raised' },
  { label: 'overlay', className: 'shadow-overlay' },
];

const cropOptions = [
  { value: 'rice', label: 'Rice' },
  { value: 'wheat', label: 'Wheat' },
  { value: 'maize', label: 'Maize' },
];

const barData = [
  { label: 'Rice', value: 82, tone: 'brand' },
  { label: 'Wheat', value: 64, tone: 'success' },
  { label: 'Maize', value: 48, tone: 'info' },
  { label: 'Pulse', value: 31, tone: 'warning' },
];

const trendData = [
  { label: 'Jan', value: 42 },
  { label: 'Feb', value: 55 },
  { label: 'Mar', value: 49 },
  { label: 'Apr', value: 71 },
  { label: 'May', value: 66 },
  { label: 'Jun', value: 88 },
];

const qualityData = [
  { label: 'Grade A', value: 68, tone: 'success' },
  { label: 'Grade B', value: 24, tone: 'brand' },
  { label: 'Review', value: 8, tone: 'warning' },
];

function Section({ id, title, description, children }) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-heading font-semibold">{title}</h2>
        {description ? (
          <p className="max-w-3xl text-body-sm text-content-muted">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Demo({ title, children, className }) {
  return (
    <div className="flex flex-col gap-3">
      {title ? (
        <p className="text-caption font-semibold uppercase tracking-wider text-content-subtle">
          {title}
        </p>
      ) : null}
      <div
        className={cn(
          'flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-5',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export default function DesignSystemPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const toast = useToast();

  return (
    <main id="main-content" className="mx-auto max-w-7xl px-page py-section">
      <div className="flex flex-col gap-14">
        <header className="flex max-w-3xl flex-col gap-4">
          <Badge tone="brand" dot>
            CROPSY design system
          </Badge>
          <h1 className="text-display font-bold">Build consistent agricultural SaaS interfaces</h1>
          <p className="text-body-lg text-content-muted">
            Semantic tokens, reusable components, responsive layouts, and accessible interaction
            patterns. Every element on this page is built from the shared primitives in
            <code className="mx-1 rounded-xs bg-surface-muted px-1.5 py-0.5 font-mono text-body-sm">
              components/ui
            </code>
            .
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="#components" className={buttonStyles()}>
              Browse components
            </a>
            <Button
              variant="secondary"
              onClick={() =>
                toast.info('Design system', {
                  description: 'Toast notifications are provider-driven and accessible.',
                })
              }
            >
              Preview toast
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <Section
          id="tokens"
          title="Foundations"
          description="Color, typography, spacing, radius, and shadow tokens map to CSS variables and Tailwind utilities."
        >
          <Demo title="Color tokens" className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {colorTokens.map((token) => (
              <div key={token.label} className="flex flex-col gap-2">
                <span
                  className={cn('h-12 w-full rounded-control border border-line', token.className)}
                />
                <span className="font-mono text-caption text-content-muted">{token.label}</span>
              </div>
            ))}
          </Demo>

          <Demo title="Typography scale" className="flex-col items-start">
            <p className="text-display font-bold">Display</p>
            <p className="text-title font-semibold">Title</p>
            <p className="text-heading font-semibold">Heading</p>
            <p className="text-subheading font-semibold">Subheading</p>
            <p className="text-body">Body — readable 16px with 1.625 line height.</p>
            <p className="text-body-sm text-content-muted">Body small for supporting details.</p>
            <p className="text-caption text-content-subtle">Caption for metadata and timestamps.</p>
            <p className="text-overline font-semibold uppercase text-content-subtle">Overline</p>
          </Demo>

          <div className="grid gap-4 lg:grid-cols-3">
            <Demo title="Spacing" className="flex-col items-start">
              {['px-page', 'py-section', 'p-card', 'gap-field-gap'].map((token) => (
                <code
                  key={token}
                  className="rounded-xs bg-surface-muted px-2 py-1 font-mono text-caption"
                >
                  {token}
                </code>
              ))}
            </Demo>
            <Demo title="Border radius" className="grid grid-cols-3 gap-4">
              {radii.map((radius) => (
                <div key={radius.label} className="flex flex-col items-center gap-2">
                  <span
                    className={cn(
                      'h-12 w-12 border border-line bg-brand-50 dark:bg-brand-950/40',
                      radius.className,
                    )}
                  />
                  <span className="font-mono text-caption text-content-muted">{radius.label}</span>
                </div>
              ))}
            </Demo>
            <Demo title="Shadows" className="grid grid-cols-3 gap-4">
              {shadows.map((shadow) => (
                <div key={shadow.label} className="flex flex-col items-center gap-2">
                  <span className={cn('h-12 w-12 rounded-card bg-surface', shadow.className)} />
                  <span className="font-mono text-caption text-content-muted">{shadow.label}</span>
                </div>
              ))}
            </Demo>
          </div>
        </Section>

        <Section
          id="components"
          title="Core components"
          description="Buttons, badges, fields, overlays, and feedback primitives."
        >
          <Demo title="Buttons">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="link">Link</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </Demo>

          <Demo title="Badges">
            <Badge>Neutral</Badge>
            <Badge tone="brand" dot>
              Brand
            </Badge>
            <Badge tone="success">Success</Badge>
            <Badge tone="warning">Warning</Badge>
            <Badge tone="danger">Danger</Badge>
            <Badge tone="info">Info</Badge>
          </Demo>

          <div className="grid gap-4 lg:grid-cols-2">
            <Demo title="Inputs" className="flex-col items-stretch">
              <Field label="Farm name" hint="Visible to your organization">
                <Input placeholder="e.g. Green Field Farm" />
              </Field>
              <Field label="Notes">
                <Textarea placeholder="Describe the current crop cycle" />
              </Field>
              <Field label="Invalid input" error="This field is required.">
                <Input placeholder="Enter a value" />
              </Field>
            </Demo>
            <Demo title="Selects and choices" className="flex-col items-stretch">
              <SelectField
                label="Primary crop"
                placeholder="Choose a crop"
                options={cropOptions}
                defaultValue=""
              />
              <SelectField
                label="Irrigation"
                options={['Rainfed', 'Scheduled', 'Drip']}
                defaultValue="Drip"
              />
              <div className="flex flex-wrap gap-6">
                <Checkbox label="Email me updates" defaultChecked />
                <Radio label="Standard plan" name="plan" defaultChecked />
              </div>
            </Demo>
          </div>

          <Demo title="Modal and dropdown">
            <Button onClick={() => setModalOpen(true)}>Open modal</Button>
            <Dropdown
              label="Actions"
              items={[
                {
                  label: 'Add crop cycle',
                  icon: <PlusIcon className="h-4 w-4" />,
                  onSelect: () => toast.success('Crop cycle started'),
                },
                {
                  label: 'View inventory',
                  icon: <PackageIcon className="h-4 w-4" />,
                  onSelect: () => toast.info('Opening inventory'),
                },
                { type: 'divider' },
                {
                  label: 'Delete draft',
                  tone: 'danger',
                  onSelect: () => toast.error('Draft deleted'),
                },
              ]}
            />
          </Demo>

          <Demo title="Toast notifications">
            <Button
              variant="secondary"
              onClick={() => toast.success('Saved', { description: 'Your changes are live.' })}
            >
              Success
            </Button>
            <Button
              variant="secondary"
              onClick={() => toast.error('Request failed', { description: 'Please try again.' })}
            >
              Error
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast.warning('Check inventory', { description: 'Two items are low in stock.' })
              }
            >
              Warning
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast.info('Advisory only', { description: 'AI output is not a certified claim.' })
              }
            >
              Info
            </Button>
          </Demo>
        </Section>

        <Section
          id="data"
          title="Data display"
          description="Cards, tables, charts, and dashboard widgets use the same semantic surface tokens."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Card title</CardTitle>
                <CardDescription>Cards provide a consistent content boundary.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-body-sm text-content-muted">
                  Use the header, content, and footer slots instead of recreating padding and
                  borders.
                </p>
              </CardContent>
            </Card>
            <ChartCard title="Harvest by crop" description="Recorded yield in kilograms">
              <BarChart data={barData} valueFormatter={(value) => `${value} kg`} />
            </ChartCard>
          </div>

          <Table caption="Inventory snapshot">
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Rice seed</TableCell>
                <TableCell>Seed</TableCell>
                <TableCell>1,240 kg</TableCell>
                <TableCell>
                  <Badge tone="success">Available</Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Organic fertilizer</TableCell>
                <TableCell>Input</TableCell>
                <TableCell>86 kg</TableCell>
                <TableCell>
                  <Badge tone="warning">Low stock</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Yield trend" description="Recorded observations">
              <LineChart data={trendData} valueFormatter={(value) => `${value} kg`} />
            </ChartCard>
            <ChartCard title="Quality distribution" description="Inspected lots">
              <DonutChart
                data={qualityData}
                centerLabel="Lots"
                valueFormatter={(value) => `${value}%`}
              />
            </ChartCard>
          </div>

          <DashboardGrid>
            <StatCard
              label="Active farms"
              value="128"
              change="+12%"
              trend="up"
              helper="this quarter"
              icon={<PackageIcon className="h-5 w-5" />}
            />
            <StatCard
              label="Pending inspections"
              value="14"
              change="−4%"
              trend="down"
              helper="since last week"
              icon={<Badge tone="warning">QA</Badge>}
            />
            <StatCard
              label="Verified batches"
              value="342"
              change="+8%"
              trend="up"
              helper="all time"
            />
            <StatCard label="Open alerts" value="3" change="Needs review" trend="neutral" />
          </DashboardGrid>

          <div className="grid gap-4 lg:grid-cols-3">
            <ProgressWidget
              title="Season progress"
              value={68}
              helper="9 of 13 activities complete"
            />
            <ActivityFeed
              items={[
                {
                  id: '1',
                  title: 'Inspection completed',
                  description: 'Batch CR-1042 passed quality review.',
                  time: '10 min ago',
                  tone: 'success',
                },
                {
                  id: '2',
                  title: 'Stock adjusted',
                  description: 'Rice seed reduced by 40 kg.',
                  time: '2 h ago',
                },
              ]}
            />
            <QuickActions
              actions={[
                {
                  label: 'Add farm',
                  description: 'Register a new farm',
                  href: '/design-system',
                  icon: <PlusIcon className="h-4 w-4" />,
                },
                {
                  label: 'Record harvest',
                  description: 'Log a completed harvest',
                  href: '/design-system',
                  icon: <PackageIcon className="h-4 w-4" />,
                },
              ]}
            />
          </div>
        </Section>

        <Section
          id="navigation"
          title="Navigation"
          description="Responsive navigation and sidebar primitives with active-state awareness."
        >
          <div
            className="overflow-hidden rounded-card border border-line"
            style={{ position: 'static' }}
          >
            <Navbar links={navLinks} actions={<ThemeToggle />} style={{ position: 'static' }} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Demo title="Nav links" className="flex-col items-start">
              <NavLink href="/design-system" label="Overview" active />
              <NavLink href="/verify/demo-batch" label="Verification" />
            </Demo>
            <Demo title="Sidebar links" className="flex-col items-start">
              <SidebarLink
                href="/design-system"
                label="Dashboard"
                icon={<PackageIcon className="h-4 w-4" />}
                active
              />
              <SidebarLink
                href="/verify/demo-batch"
                label="Traceability"
                icon={<Badge tone="success">Live</Badge>}
              />
            </Demo>
          </div>
        </Section>

        <Section
          id="states"
          title="States and feedback"
          description="Empty, loading, and error states share the same surface and typography rules."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <EmptyState
              title="No crops yet"
              description="Add your first crop cycle to see insights here."
            />
            <LoadingState label="Loading dashboard" description="Fetching recorded activity." />
            <ErrorState
              title="Could not load inventory"
              description="The service did not respond. Try the request again."
              onRetry={() => toast.info('Retrying request')}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Demo title="Skeletons" className="flex-col items-stretch">
              <SkeletonText lines={3} />
              <span className="block h-10 w-full animate-pulse rounded-control bg-surface-muted" />
            </Demo>
            <Demo title="Loading overlay" className="p-0">
              <div className="relative h-40 w-full rounded-card border border-line">
                <LoadingOverlay label="Refreshing metrics" />
              </div>
            </Demo>
          </div>
          <InlineError
            title="One record was not synced"
            description="The remaining records were saved successfully."
            onRetry={() => toast.success('Sync retried')}
          />
        </Section>

        <footer className="border-t border-line pt-6 text-body-sm text-content-muted">
          See{' '}
          <code className="rounded-xs bg-surface-muted px-1.5 py-0.5 font-mono text-body-sm">
            docs/design-system.md
          </code>{' '}
          for token values, component APIs, and usage rules.
        </footer>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create crop cycle"
        description="Confirm the details before saving."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setModalOpen(false);
                toast.success('Crop cycle created');
              }}
            >
              Save cycle
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Cycle name">
            <Input defaultValue="R2026 Main Season" />
          </Field>
          <SelectField label="Crop" options={cropOptions} defaultValue="rice" />
        </div>
      </Modal>
    </main>
  );
}
