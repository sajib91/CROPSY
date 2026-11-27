'use client';

import { cloneElement, forwardRef, isValidElement, useId } from 'react';
import { cn } from './cn';

const controlBase =
  'block w-full rounded-control border bg-surface px-3 text-body text-content shadow-sm transition-colors placeholder:text-content-subtle focus-ring disabled:cursor-not-allowed disabled:opacity-60';

const controlState = (invalid) =>
  invalid ? 'border-danger focus-visible:ring-danger' : 'border-line hover:border-line-strong';

export function Label({ className, required, children, ...props }) {
  return (
    <label className={cn('text-body-sm font-semibold text-content', className)} {...props}>
      {children}
      {required ? (
        <span aria-hidden="true" className="ml-1 text-danger">
          *
        </span>
      ) : null}
    </label>
  );
}

export function HelperText({ className, children, ...props }) {
  return (
    <p className={cn('text-caption text-content-muted', className)} {...props}>
      {children}
    </p>
  );
}

export function ErrorText({ className, children, ...props }) {
  return (
    <p role="alert" className={cn('text-caption font-medium text-danger', className)} {...props}>
      {children}
    </p>
  );
}

export function Field({
  label,
  hint,
  error,
  required = false,
  hideLabel = false,
  className,
  children,
}) {
  const generatedId = `field-${useId().replace(/:/g, '')}`;
  const childProps = isValidElement(children) ? children.props : {};
  const controlId = childProps.id || generatedId;
  const describedBy = [
    childProps['aria-describedby'],
    hint ? `${controlId}-hint` : null,
    error ? `${controlId}-error` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const control = isValidElement(children)
    ? cloneElement(children, {
        id: controlId,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : childProps['aria-invalid'],
      })
    : children;

  return (
    <div className={cn('flex flex-col gap-field-gap', className)}>
      {label ? (
        <Label htmlFor={controlId} required={required} className={hideLabel && 'sr-only'}>
          {label}
        </Label>
      ) : null}
      {control}
      {hint ? <HelperText id={`${controlId}-hint`}>{hint}</HelperText> : null}
      {error ? <ErrorText id={`${controlId}-error`}>{error}</ErrorText> : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ className, invalid = false, ...props }, ref) {
  return (
    <input
      {...props}
      ref={ref}
      aria-invalid={invalid || props['aria-invalid'] || undefined}
      className={cn(controlBase, controlState(invalid), 'h-control', className)}
    />
  );
});

export const Textarea = forwardRef(function Textarea(
  { className, invalid = false, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      {...props}
      ref={ref}
      rows={rows}
      aria-invalid={invalid || props['aria-invalid'] || undefined}
      className={cn(controlBase, controlState(invalid), 'min-h-24 resize-y py-2', className)}
    />
  );
});

const choiceInput =
  'h-4 w-4 shrink-0 cursor-pointer rounded-xs border-line-strong text-brand-700 accent-brand-700 focus-ring disabled:cursor-not-allowed disabled:opacity-60';

export const Checkbox = forwardRef(function Checkbox(
  { label, description, className, id, ...props },
  ref,
) {
  const generatedId = `checkbox-${useId().replace(/:/g, '')}`;
  const inputId = id || generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input
        {...props}
        ref={ref}
        id={inputId}
        type="checkbox"
        aria-describedby={descriptionId}
        className={cn(choiceInput, 'mt-0.5')}
      />
      {label || description ? (
        <div className="flex flex-col gap-0.5">
          {label ? (
            <Label htmlFor={inputId} className="cursor-pointer font-normal">
              {label}
            </Label>
          ) : null}
          {description ? <HelperText id={descriptionId}>{description}</HelperText> : null}
        </div>
      ) : null}
    </div>
  );
});

export const Radio = forwardRef(function Radio(
  { label, description, className, id, ...props },
  ref,
) {
  const generatedId = `radio-${useId().replace(/:/g, '')}`;
  const inputId = id || generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input
        {...props}
        ref={ref}
        id={inputId}
        type="radio"
        aria-describedby={descriptionId}
        className={cn(choiceInput, 'mt-0.5 rounded-pill')}
      />
      {label || description ? (
        <div className="flex flex-col gap-0.5">
          {label ? (
            <Label htmlFor={inputId} className="cursor-pointer font-normal">
              {label}
            </Label>
          ) : null}
          {description ? <HelperText id={descriptionId}>{description}</HelperText> : null}
        </div>
      ) : null}
    </div>
  );
});
