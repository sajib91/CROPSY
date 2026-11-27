import Link from 'next/link';
import { badgeStyles } from './badge-styles';
import { buttonStyles } from './button-styles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { cn } from './cn';
import { ArrowRightIcon, TrendingDownIcon, TrendingUpIcon } from './icons';

export function DashboardGrid({ className, children }) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, change, trend = 'neutral', helper, icon, className }) {
  const TrendIcon = trend === 'down' ? TrendingDownIcon : TrendingUpIcon;
  const trendClass =
    trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-content-muted';

  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-3 border-none pb-2">
        <div className="flex flex-col gap-1">
          <CardDescription>{label}</CardDescription>
          <p className="text-title font-bold text-content">{value}</p>
        </div>
        {icon ? (
          <span className="flex h-10 w-10 items-center justify-center rounded-control bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
            {icon}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 pt-0">
        {change ? (
          <span
            className={cn('inline-flex items-center gap-1 text-body-sm font-semibold', trendClass)}
          >
            {trend !== 'neutral' ? <TrendIcon className="h-4 w-4" /> : null}
            {change}
          </span>
        ) : null}
        {helper ? <span className="text-caption text-content-muted">{helper}</span> : null}
      </CardContent>
    </Card>
  );
}

const progressTones = {
  brand: 'bg-brand-600',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

export function ProgressWidget({
  title,
  description,
  value = 0,
  max = 100,
  tone = 'brand',
  helper,
  className,
}) {
  const safeMax = max > 0 ? max : 100;
  const percent = Math.min(100, Math.max(0, (Number(value) / safeMax) * 100));

  return (
    <Card className={className}>
      <CardHeader className="border-none pb-2">
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        <div className="flex items-center justify-between text-body-sm">
          <span className="font-semibold text-content">{value}</span>
          <span className="text-content-muted">of {max}</span>
        </div>
        <div
          role="progressbar"
          aria-label={title}
          aria-valuemin={0}
          aria-valuemax={safeMax}
          aria-valuenow={Number(value)}
          className="h-2 w-full overflow-hidden rounded-pill bg-surface-muted"
        >
          <div
            className={cn(
              'h-full rounded-pill transition-[width]',
              progressTones[tone] ?? progressTones.brand,
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        {helper ? <p className="text-caption text-content-muted">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}

export function ActivityFeed({ title = 'Recent activity', items = [], className, footer }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-body-sm text-content-muted">No activity recorded yet.</p>
        ) : (
          <ol className="relative space-y-5 border-l border-line pl-5">
            {items.map((item) => (
              <li key={item.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-pill border-2 border-surface bg-brand-600"
                />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-body-sm font-semibold text-content">{item.title}</p>
                  {item.time ? (
                    <time className="text-caption text-content-subtle">{item.time}</time>
                  ) : null}
                </div>
                {item.description ? (
                  <p className="mt-1 text-caption text-content-muted">{item.description}</p>
                ) : null}
                {item.tone ? (
                  <span className="mt-2 inline-block">
                    <span className={badgeStyles({ tone: item.tone })}>
                      {item.label ?? item.tone}
                    </span>
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
      {footer ? <div className="border-t border-line p-card">{footer}</div> : null}
    </Card>
  );
}

export function QuickActions({ title = 'Quick actions', actions = [], className }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Frequent tasks for this workspace.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={buttonStyles({
              variant: 'secondary',
              className: 'h-auto justify-start py-2.5 text-left',
            })}
          >
            {action.icon ? (
              <span className="text-brand-700 dark:text-brand-300">{action.icon}</span>
            ) : null}
            <span className="flex-1">
              <span className="block font-semibold">{action.label}</span>
              {action.description ? (
                <span className="block text-caption font-normal text-content-muted">
                  {action.description}
                </span>
              ) : null}
            </span>
            <ArrowRightIcon className="h-4 w-4 text-content-subtle" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
