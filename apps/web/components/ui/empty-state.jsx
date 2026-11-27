'use client';

import { cn } from './cn';
import { LeafIcon } from './icons';

export function EmptyState({ icon, title, description, actions, compact = false, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-line bg-surface text-center',
        compact ? 'gap-2 px-5 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-pill bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
        {icon ?? <LeafIcon className="h-6 w-6" />}
      </span>
      {title ? <h3 className="text-subheading font-semibold text-content">{title}</h3> : null}
      {description ? (
        <p className="max-w-md text-body-sm text-content-muted">{description}</p>
      ) : null}
      {actions ? <div className="mt-2 flex flex-wrap justify-center gap-3">{actions}</div> : null}
    </div>
  );
}
