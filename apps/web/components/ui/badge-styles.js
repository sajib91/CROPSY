import { cn } from './cn';

const tones = {
  neutral: 'border-line bg-surface-muted text-content-muted',
  brand:
    'border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-950/50 dark:text-brand-200',
  success: 'border-success-border bg-success-bg text-success',
  warning: 'border-warning-border bg-warning-bg text-warning',
  danger: 'border-danger-border bg-danger-bg text-danger',
  info: 'border-info-border bg-info-bg text-info',
};

export function badgeStyles({ tone = 'neutral', className } = {}) {
  return cn(
    'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-caption font-semibold',
    tones[tone] ?? tones.neutral,
    className,
  );
}
