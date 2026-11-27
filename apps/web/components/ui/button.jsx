'use client';

import { forwardRef } from 'react';
import { buttonStyles } from './button-styles';
import { cn } from './cn';
import { Spinner } from './spinner';

export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    loadingText,
    leadingIcon,
    trailingIcon,
    disabled,
    className,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, fullWidth, className })}
      {...props}
    >
      {loading ? <Spinner className={cn('h-4 w-4', size === 'lg' && 'h-5 w-5')} /> : leadingIcon}
      {loading && loadingText ? loadingText : children}
      {!loading && trailingIcon}
    </button>
  );
});
