import { cn } from './cn';
import { Spinner } from './spinner';

export { Spinner };

export function Skeleton({ className }) {
  return (
    <span
      aria-hidden="true"
      className={cn('block animate-pulse rounded-xs bg-surface-muted', className)}
    />
  );
}

export function SkeletonText({ lines = 3, className }) {
  const widths = ['w-full', 'w-11/12', 'w-4/5', 'w-2/3'];
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn('h-3', widths[index % widths.length])} />
      ))}
    </div>
  );
}

export function LoadingState({ label = 'Loading', description, className }) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <Spinner className="h-7 w-7 text-brand-600" />
      <p className="text-body-sm font-semibold text-content">{label}</p>
      {description ? (
        <p className="max-w-md text-caption text-content-muted">{description}</p>
      ) : null}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function LoadingOverlay({ label = 'Loading', visible = true }) {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-30 flex items-center justify-center rounded-card bg-surface/80 backdrop-blur-sm"
    >
      <span className="flex items-center gap-3 text-body-sm font-semibold text-content">
        <Spinner className="h-5 w-5 text-brand-600" />
        {label}
      </span>
    </div>
  );
}
