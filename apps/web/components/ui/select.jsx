'use client';

import { forwardRef } from 'react';
import { cn } from './cn';
import { ChevronDownIcon } from './icons';
import { Field } from './input';

const selectBase =
  'block w-full appearance-none rounded-control border bg-surface py-2 pl-3 pr-10 text-body text-content shadow-sm transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-60';

export const Select = forwardRef(function Select(
  { className, invalid = false, options, placeholder, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        {...props}
        ref={ref}
        aria-invalid={invalid || props['aria-invalid'] || undefined}
        className={cn(
          selectBase,
          invalid ? 'border-danger' : 'border-line hover:border-line-strong',
          className,
        )}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options
          ? options.map((option) => {
              const normalized =
                typeof option === 'string' ? { value: option, label: option } : option;
              return (
                <option
                  key={normalized.value}
                  value={normalized.value}
                  disabled={normalized.disabled}
                >
                  {normalized.label}
                </option>
              );
            })
          : children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-subtle" />
    </div>
  );
});

export function SelectField({ label, hint, error, required, className, ...props }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      <Select invalid={Boolean(error)} {...props} />
    </Field>
  );
}
