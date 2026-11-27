'use client';

import { Button } from './button';
import { cn } from './cn';
import { AlertTriangleIcon } from './icons';

export function ErrorState({
  title = 'Something went wrong',
  description = 'We could not complete this request. Please try again.',
  retryLabel = 'Try again',
  onRetry,
  className,
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-danger-border bg-danger-bg px-6 py-12 text-center',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-pill bg-surface text-danger">
        <AlertTriangleIcon className="h-6 w-6" />
      </span>
      <h3 className="text-subheading font-semibold text-content">{title}</h3>
      <p className="max-w-md text-body-sm text-content-muted">{description}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry} className="mt-2">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function InlineError({ title, description, onRetry, retryLabel = 'Retry', className }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-control border border-danger-border bg-danger-bg px-4 py-3',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <div className="flex flex-col gap-0.5">
          {title ? <p className="text-body-sm font-semibold text-content">{title}</p> : null}
          {description ? <p className="text-caption text-content-muted">{description}</p> : null}
        </div>
      </div>
      {onRetry ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
