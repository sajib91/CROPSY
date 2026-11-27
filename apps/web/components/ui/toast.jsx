'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from './cn';
import { AlertTriangleIcon, CheckIcon, InfoIcon, XIcon } from './icons';

const ToastContext = createContext(null);
let toastSequence = 0;

const tones = {
  success: {
    icon: CheckIcon,
    wrapper: 'border-success-border',
    iconClass: 'bg-success-bg text-success',
  },
  error: {
    icon: AlertTriangleIcon,
    wrapper: 'border-danger-border',
    iconClass: 'bg-danger-bg text-danger',
  },
  warning: {
    icon: AlertTriangleIcon,
    wrapper: 'border-warning-border',
    iconClass: 'bg-warning-bg text-warning',
  },
  info: {
    icon: InfoIcon,
    wrapper: 'border-info-border',
    iconClass: 'bg-info-bg text-info',
  },
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside <ToastProvider>.');
  }
  return context;
}

function ToastItem({ toast, onDismiss }) {
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(toast.duration);
  const startedAtRef = useRef(0);
  const tone = tones[toast.tone] ?? tones.info;
  const Icon = tone.icon;

  useEffect(() => {
    if (paused || toast.duration <= 0) return undefined;

    startedAtRef.current = Date.now();
    const timer = setTimeout(() => onDismiss(toast.id), remainingRef.current);

    return () => {
      clearTimeout(timer);
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (Date.now() - startedAtRef.current),
      );
    };
  }, [paused, toast.duration, toast.id, onDismiss]);

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
      className={cn(
        'pointer-events-auto flex w-full animate-slide-up items-start gap-3 rounded-card border bg-surface-raised p-4 shadow-raised',
        tone.wrapper,
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-pill',
          tone.iconClass,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {toast.title ? (
          <p className="text-body-sm font-semibold text-content">{toast.title}</p>
        ) : null}
        {toast.description ? (
          <p className="text-caption text-content-muted">{toast.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className="rounded-xs p-1 text-content-subtle transition-colors hover:bg-surface-muted hover:text-content focus-ring"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children, max = 4 }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    ({ tone = 'info', title, description, duration = 5000 }) => {
      const id = `toast-${++toastSequence}`;
      setToasts((current) => [...current, { id, tone, title, description, duration }].slice(-max));
      return id;
    },
    [max],
  );

  const toast = useMemo(
    () => ({
      show,
      dismiss,
      success: (title, options = {}) => show({ tone: 'success', title, ...options }),
      error: (title, options = {}) => show({ tone: 'error', title, ...options }),
      warning: (title, options = {}) => show({ tone: 'warning', title, ...options }),
      info: (title, options = {}) => show({ tone: 'info', title, ...options }),
    }),
    [dismiss, show],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3"
      >
        {toasts.map((item) => (
          <ToastItem key={item.id} toast={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function Toast({ tone = 'info', title, description, onDismiss }) {
  return (
    <ToastItem
      toast={{ id: 'static', tone, title, description, duration: 0 }}
      onDismiss={onDismiss ?? (() => {})}
    />
  );
}
