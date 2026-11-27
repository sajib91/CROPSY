# CROPSY design system

The CROPSY design system is the single source of truth for web UI styling and behavior. It lives in
`apps/web` because the web app is JavaScript-only and Tailwind already scans `app/` and
`components/`. Interactive gallery: `http://localhost:3000/design-system`.

## Principles

1. **Use semantic tokens, not raw palette classes.** Write `bg-surface`, `text-content-muted`, or
   `border-line`; do not write `bg-slate-900` or `text-emerald-400` in feature code.
2. **Compose primitives.** Cards, tables, fields, buttons, and states come from `components/ui`.
   Do not replicate padding, border, radius, or focus styles in page files.
3. **Accessible by default.** Semantic HTML, visible focus, keyboard operation, reduced-motion
   support, and labelled data are part of every component.
4. **Responsive by default.** Layouts start single-column and expand with `sm:`, `md:`, `lg:`, and
   `xl:` only where density helps.
5. **Honest product language.** Advisory AI output is never presented as a certified diagnosis,
   quote, or regulation.

## Location map

```text
apps/web/app/globals.css                 CSS variables, base styles, focus helper
apps/web/tailwind.config.mjs             Token-to-Tailwind mappings
apps/web/components/ui/                  Reusable components and style helpers
apps/web/components/ui/index.js          Public import surface
apps/web/app/design-system/page.js       Interactive component gallery
```

Import from the barrel:

```jsx
import { Button, Card, CardContent, Input, useToast } from '@/components/ui';
```

Use `@/components/ui` for concise imports, or a relative path when already inside `components/ui`.

---

## 1. Color tokens

Colors are space-separated RGB channels in CSS variables, mapped to Tailwind in
`tailwind.config.mjs`. This keeps alpha modifiers such as `bg-surface/80` working.

### Brand scale

| Token | Usage |
| --- | --- |
| `brand-50` – `brand-100` | Subtle backgrounds, hover states, badges |
| `brand-200` – `brand-300` | Borders on light surfaces, dark-mode accents |
| `brand-400` – `brand-500` | Charts, icons, dark-mode primary surfaces |
| `brand-600` | Focus ring, interactive accents |
| `brand-700` | Light-mode primary action background, link text |
| `brand-800` – `brand-950` | Hover/active states and dark-mode contrast text |

### Semantic tokens

| Token | Meaning | Typical classes |
| --- | --- | --- |
| `canvas` | Page background | `bg-canvas` |
| `surface` / `surface-muted` / `surface-raised` | Cards, inputs, popovers | `bg-surface`, `bg-surface-muted` |
| `surface-inverse` | Overlay scrim, inverted surfaces | `bg-surface-inverse/60` |
| `content` / `content-muted` / `content-subtle` | Primary, secondary, metadata text | `text-content`, `text-content-muted` |
| `content-inverse` / `content-on-brand` | Text on inverted or brand surfaces | `text-content-inverse` |
| `line` / `line-strong` | Dividers and control borders | `border-line`, `border-line-strong` |
| `focus` | Keyboard focus ring | `focus-ring` utility |
| `success`, `warning`, `danger`, `info` | State text and icons | `text-success`, `text-danger` |
| `success-bg`, `warning-bg`, `danger-bg`, `info-bg` | State backgrounds | `bg-danger-bg` |
| `success-border`, `warning-border`, `danger-border`, `info-border` | State borders | `border-success-border` |

Dark mode swaps semantic values when `<html class="dark">` is present. `ThemeProvider` and
`ThemeToggle` are already mounted in the root layout; the preference is persisted in
`localStorage` under `cropsy-theme` and an inline script applies it before hydration.

```jsx
// Good
<Card className="border-line bg-surface text-content" />

// Avoid
<div className="border-slate-800 bg-slate-900 text-emerald-300" />
```

---

## 2. Typography

`Inter` is preferred with a system sans-serif fallback; no external font request is made. Monospace
uses the platform mono stack for codes, IDs, and timestamps.

| Token | Size / line height | Use |
| --- | --- | --- |
| `text-display` | clamp(2.25rem, 6vw, 3.5rem) / 1.08 | Marketing or hero title |
| `text-title` | clamp(1.75rem, 4vw, 2.25rem) / 1.2 | Page title |
| `text-heading` | 1.5rem / 1.3 | Section heading |
| `text-subheading` | 1.125rem / 1.4 | Card heading |
| `text-body-lg` | 1.0625rem / 1.65 | Introductory copy |
| `text-body` | 1rem / 1.625 | Default body |
| `text-body-sm` | 0.875rem / 1.5 | Dense UI, table cells |
| `text-caption` | 0.75rem / 1.4 | Metadata, hints |
| `text-overline` | 0.6875rem / 1.3, wide tracking | Eyebrows and labels |

Rules:

- Use at most one `text-display` or `text-title` per view.
- Pair headings with `font-semibold` or `font-bold`; do not fake hierarchy with color alone.
- Body text uses `text-content`; secondary text uses `text-content-muted`, never a low-opacity white.

---

## 3. Spacing

The 4px Tailwind scale (`p-4`, `gap-2`, `mt-6`, …) is the default. Semantic aliases cover recurring
layout rhythm:

| Token | Value | Use |
| --- | --- | --- |
| `px-page` / `py-page` | clamp(1rem, 4vw, 2.5rem) | Page gutters |
| `py-section` | clamp(2rem, 6vw, 4rem) | Vertical section spacing |
| `p-card` | 1.5rem | Card padding |
| `h-control` / `w-control` | 2.5rem | Minimum button and input target |
| `gap-field-gap` | 0.5rem | Label/control/hint gap |

Use `gap-*` for sibling spacing instead of margins on every child.

---

## 4. Border radius

| Token | Value | Use |
| --- | --- | --- |
| `rounded-xs` | 0.25rem | Skeletons, tiny chips |
| `rounded-control` | 0.625rem | Inputs, buttons, badges containers |
| `rounded-card` | 1rem | Cards, tables, empty/loading states |
| `rounded-panel` | 1.25rem | Modal panels |
| `rounded-pill` | 9999px | Status dots, progress bars, pills |

---

## 5. Shadows

| Token | Use |
| --- | --- |
| `shadow-card` | Default resting elevation for cards and tables |
| `shadow-raised` | Dropdowns, popovers, toasts |
| `shadow-overlay` | Modal panels and drawers |

The shadow color follows `--cropsy-shadow`, so dark mode does not produce bright halos.

---

## 6. Component catalog

All examples assume `import { ... } from '@/components/ui'`.

### Button

```jsx
<Button variant="primary" size="md" onClick={save}>Save batch</Button>
<Button variant="secondary" loading loadingText="Saving…">Save batch</Button>
<Link href="/farms" className={buttonStyles({ variant: 'outline' })}>View farms</Link>
```

| Prop | Values | Default |
| --- | --- | --- |
| `variant` | `primary`, `secondary`, `outline`, `ghost`, `danger`, `link` | `primary` |
| `size` | `sm`, `md`, `lg`, `icon` | `md` |
| `fullWidth` | boolean | `false` |
| `loading` / `loadingText` | boolean / string | `false` |
| `leadingIcon` / `trailingIcon` | React node | — |

Buttons default to `type="button"` to avoid accidental form submits. `buttonStyles()` renders the
same visual treatment on links.

### Input, Textarea, Field, Checkbox, Radio

```jsx
<Field label="Farm name" hint="Visible to your organization" error={errors.name}>
  <Input name="name" required />
</Field>
<Field label="Notes"><Textarea name="notes" rows={4} /></Field>
<Checkbox label="Email me updates" defaultChecked />
<Radio label="Standard plan" name="plan" value="standard" />
```

`Field` clones its child to supply `id`, `aria-describedby`, and `aria-invalid`; it does not require
manual ID wiring. `Input`, `Textarea`, `Checkbox`, and `Radio` forward refs for form libraries.

### Select

```jsx
<SelectField
  label="Primary crop"
  placeholder="Choose a crop"
  options={[{ value: 'rice', label: 'Rice' }, { value: 'wheat', label: 'Wheat' }]}
/>
```

`Select` is a native styled `<select>`; use it for standard single-choice fields. `options` accepts
strings or `{ value, label, disabled }` objects, or pass `<option>` children.

### Modal

```jsx
<Modal
  open={open}
  onClose={() => setOpen(false)}
  title="Create crop cycle"
  description="Confirm the details before saving."
  footer={<Button onClick={save}>Save</Button>}
>
  <Field label="Cycle name"><Input /></Field>
</Modal>
```

The modal traps focus, closes on `Escape`, restores the previously focused element, locks body
scroll, and uses `aria-modal` with labelled title/description. Set `closeOnOverlayClick={false}` for
destructive workflows.

### Dropdown

```jsx
<Dropdown
  label="Actions"
  items={[
    { label: 'Edit', href: '/farms/1/edit' },
    { type: 'divider' },
    { label: 'Delete', tone: 'danger', onSelect: remove },
  ]}
/>
```

Supports arrow-key navigation, `Home`/`End`, `Escape`, outside-click dismissal, disabled items,
icons, descriptions, and custom triggers via `renderTrigger({ open, toggle, triggerRef, menuId })`.
Attach `triggerRef` to a custom trigger so outside-click detection works.

### Table

```jsx
<Table caption="Inventory snapshot">
  <TableHeader>
    <TableRow><TableHead>Item</TableHead><TableHead>Stock</TableHead></TableRow>
  </TableHeader>
  <TableBody>
    <TableRow><TableCell>Rice seed</TableCell><TableCell>1,240 kg</TableCell></TableRow>
  </TableBody>
</Table>
```

Tables scroll horizontally inside a bordered container; they do not collapse columns on small
screens. Always provide a `caption` or `TableCaption` when the purpose is not obvious.

### Card

```jsx
<Card>
  <CardHeader><CardTitle>Field readiness</CardTitle><CardDescription>Latest inspection</CardDescription></CardHeader>
  <CardContent>…</CardContent>
  <CardFooter><Button>Review</Button></CardFooter>
</Card>
```

### Navigation and Sidebar

```jsx
<Navbar links={[{ label: 'Overview', href: '/' }]} actions={<ThemeToggle />} />
<Sidebar sections={[{ title: 'Workspace', items: [{ label: 'Dashboard', href: '/' }] }]} />
```

`Navbar` uses `usePathname()` for `aria-current="page"` and includes a mobile menu. `Sidebar`
provides a desktop rail plus a mobile drawer with `Escape` handling. Use one primary navigation
pattern per view.

### Dashboard widgets

```jsx
<DashboardGrid>
  <StatCard label="Active farms" value="128" change="+12%" trend="up" />
  <ProgressWidget title="Season progress" value={68} helper="9 of 13 activities" />
</DashboardGrid>
<ActivityFeed items={[{ id: '1', title: 'Inspection completed', time: '10 min ago' }]} />
<QuickActions actions={[{ label: 'Add farm', href: '/farms/new' }]} />
```

`ProgressWidget` exposes `role="progressbar"` with `aria-valuenow/min/max`. Trend direction maps to
semantic success/danger colors and an icon, not color alone.

### Charts

```jsx
<ChartCard title="Harvest by crop">
  <BarChart data={[{ label: 'Rice', value: 82, tone: 'brand' }]} valueFormatter={(v) => `${v} kg`} />
</ChartCard>
<LineChart data={[{ label: 'Jan', value: 42 }]} />
<DonutChart data={[{ label: 'Grade A', value: 68, tone: 'success' }]} />
```

Charts are dependency-free SVG/CSS primitives with a visually hidden data table for screen readers
and `role="img"` summaries. Never use a chart color to imply certification; label advisory data.

### Empty, loading, and error states

```jsx
<EmptyState title="No crops yet" description="Add your first crop cycle." actions={<Button>Add crop</Button>} />
<LoadingState label="Loading dashboard" />
<SkeletonText lines={3} />
<ErrorState title="Could not load inventory" onRetry={retry} />
<InlineError title="One record was not synced" onRetry={retry} />
<LoadingOverlay label="Refreshing metrics" />
```

These states always use the same card radius, border, and padding; do not hand-build centered
messages.

### Toast notifications

```jsx
// ToastProvider is mounted in the root layout.
const toast = useToast();
toast.success('Saved', { description: 'Your changes are live.' });
toast.error('Request failed', { description: 'Please try again.' });
toast.warning('Low stock', { description: 'Two inputs need attention.' });
toast.info('Advisory only');
```

Toasts auto-dismiss after 5 seconds, pause on hover/focus, and use `role="alert"` for errors and
`role="status"` elsewhere. `duration: 0` keeps a toast visible until dismissed.

### Theme

```jsx
<ThemeProvider>{children}</ThemeProvider>
<ThemeToggle />
```

The provider is already mounted in `app/layout.js`. Toggle only needs to be placed in a header or
toolbar.

---

## 7. Accessibility checklist

- Keep the `focus-ring` utility on every interactive custom control; do not remove outlines.
- Use semantic elements (`button`, `a`, `table`, `th`, `caption`, `label`) before adding ARIA.
- Give icon-only buttons an `aria-label`; decorative icons use `aria-hidden="true"`.
- Modal focus must stay inside the dialog and return to the trigger on close.
- Form errors are announced with `role="alert"` and linked through `aria-describedby`.
- State is conveyed with text/icon plus color, never color alone.
- Respect `prefers-reduced-motion`; global CSS already collapses animations and transitions.
- Target at least WCAG 2.1 AA contrast. Use `brand-700` on light surfaces and `brand-500` on dark.
- Keep touch targets at least 40px tall (`size="sm"` and above).

## 8. Responsive checklist

- Start with a single column; add `sm:grid-cols-2`, `lg:grid-cols-3`, `xl:grid-cols-4` as needed.
- Page gutters use `px-page`; section rhythm uses `py-section`.
- Tables scroll horizontally in a container instead of hiding columns.
- Navigation collapses into a labelled menu below `md`; sidebars become drawers.
- Charts use flexible viewBoxes and horizontal labels; provide the hidden table for long labels.
- Test at 360px, 768px, and 1280px before shipping a new view.

## 9. Contribution rules

Before adding a new UI pattern:

1. Check `components/ui/index.js` for an existing primitive or style helper.
2. Add token values only in `globals.css` and map them in `tailwind.config.mjs`.
3. Keep presentational components free of business data fetching.
4. Mark a component `'use client'` only when it uses state, effects, refs, context, or browser APIs.
5. Export it from `components/ui/index.js` and add a demo to `app/design-system/page.js`.
6. Update this document with its API and accessibility behavior.
7. Run `npm run format:check`, `npm run lint`, and `npm run build:web` from the repository root.

Do not introduce a second UI library or a parallel token set. If a component needs a new semantic
state, add the token pair (text/background/border) once and reuse it everywhere.
