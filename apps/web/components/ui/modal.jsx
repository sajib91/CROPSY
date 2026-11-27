'use client';

import { useEffect, useId, useRef } from 'react';
import { Button } from './button';
import { cn } from './cn';
import { XIcon } from './icons';

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnOverlayClick = true,
  ariaLabel,
}) {
  const generatedId = useId().replace(/:/g, '');
  const titleId = `${generatedId}-title`;
  const descriptionId = `${generatedId}-description`;
  const panelRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocusedRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll(focusableSelector);
    if (focusable?.length) {
      focusable[0].focus();
    } else {
      panel?.focus();
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const elements = Array.from(panelRef.current.querySelectorAll(focusableSelector)).filter(
        (element) =>
          !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
      );

      if (elements.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(event) => {
        if (closeOnOverlayClick && event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 animate-fade-in bg-surface-inverse/60 backdrop-blur-sm dark:bg-surface-inverse/75"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        aria-label={!title ? (ariaLabel ?? 'Dialog') : undefined}
        tabIndex={-1}
        className={cn(
          'relative z-10 w-full animate-scale-in rounded-panel border border-line bg-surface shadow-overlay focus-ring',
          sizes[size] ?? sizes.md,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line p-card">
          <div className="flex flex-col gap-1">
            {title ? (
              <h2 id={titleId} className="text-subheading font-semibold text-content">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p id={descriptionId} className="text-body-sm text-content-muted">
                {description}
              </p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close dialog"
            onClick={onClose}
            className="-mr-2 -mt-2"
          >
            <XIcon className="h-5 w-5" />
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-card">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-3 border-t border-line p-card">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
