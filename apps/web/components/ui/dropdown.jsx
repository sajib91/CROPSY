'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from './cn';
import { ChevronDownIcon } from './icons';

function moveFocus(event, menu) {
  const items = Array.from(
    menu?.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])') ?? [],
  );
  if (items.length === 0) return;

  const current = items.indexOf(document.activeElement);
  let next = current;

  if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length;
  if (event.key === 'ArrowUp') next = current <= 0 ? items.length - 1 : current - 1;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = items.length - 1;

  event.preventDefault();
  items[next].focus();
}

export function Dropdown({
  label,
  ariaLabel,
  items = [],
  align = 'right',
  className,
  renderTrigger,
}) {
  const [open, setOpen] = useState(false);
  const generatedId = useId().replace(/:/g, '');
  const menuId = `dropdown-${generatedId}`;
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const firstItem = menuRef.current?.querySelector(
      '[role="menuitem"]:not([aria-disabled="true"])',
    );
    firstItem?.focus();

    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const toggle = () => setOpen((value) => !value);
  const close = () => setOpen(false);

  return (
    <div className={cn('relative inline-flex', className)}>
      {renderTrigger ? (
        renderTrigger({ open, toggle, triggerRef, menuId })
      ) : (
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={ariaLabel}
          onClick={toggle}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className="inline-flex h-10 items-center gap-2 rounded-control border border-line bg-surface px-3 text-body-sm font-semibold text-content shadow-sm transition-colors hover:bg-surface-muted focus-ring"
        >
          {label}
          <ChevronDownIcon className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </button>
      )}

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label || ariaLabel || 'Actions'}
          onKeyDown={(event) => {
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              moveFocus(event, menuRef.current);
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
              triggerRef.current?.focus();
            }
            if (event.key === 'Tab') close();
          }}
          className={cn(
            'absolute top-full z-40 mt-2 min-w-56 animate-slide-up overflow-hidden rounded-card border border-line bg-surface-raised p-1.5 shadow-raised',
            align === 'left' ? 'left-0' : 'right-0',
          )}
        >
          {items.map((item, index) => {
            if (item.type === 'divider') {
              return (
                <div
                  key={item.id ?? `divider-${index}`}
                  role="separator"
                  className="my-1 h-px bg-line"
                />
              );
            }

            const sharedProps = {
              key: item.id ?? `${item.label}-${index}`,
              role: 'menuitem',
              tabIndex: -1,
              'aria-disabled': item.disabled || undefined,
              className: cn(
                'flex w-full items-start gap-3 rounded-xs px-3 py-2 text-left text-body-sm transition-colors focus:bg-surface-muted focus:outline-none',
                item.disabled && 'pointer-events-none opacity-50',
                item.tone === 'danger' ? 'text-danger' : 'text-content',
              ),
              onClick: (event) => {
                if (item.disabled) {
                  event.preventDefault();
                  return;
                }
                item.onSelect?.();
                close();
                triggerRef.current?.focus();
              },
            };

            const content = (
              <>
                {item.icon ? <span className="mt-0.5 text-content-subtle">{item.icon}</span> : null}
                <span className="flex flex-col">
                  <span className="font-medium">{item.label}</span>
                  {item.description ? (
                    <span className="text-caption text-content-muted">{item.description}</span>
                  ) : null}
                </span>
              </>
            );

            const { key, ...itemProps } = sharedProps;

            if (item.href && !item.disabled) {
              return (
                <Link key={key} {...itemProps} href={item.href}>
                  {content}
                </Link>
              );
            }

            return (
              <button key={key} {...itemProps} type="button" disabled={item.disabled}>
                {content}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
