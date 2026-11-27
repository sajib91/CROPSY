import { cn } from './cn';

const base =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-semibold transition-colors focus-ring disabled:pointer-events-none disabled:opacity-55';

const variants = {
  primary:
    'bg-brand-700 text-white shadow-sm hover:bg-brand-800 active:bg-brand-900 dark:bg-brand-500 dark:text-content-on-brand dark:hover:bg-brand-400 dark:active:bg-brand-300',
  secondary: 'border border-line bg-surface text-content shadow-sm hover:bg-surface-muted',
  outline:
    'border border-line-strong bg-transparent text-content hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/40',
  ghost: 'text-content-muted hover:bg-surface-muted hover:text-content',
  danger: 'bg-danger text-white shadow-sm hover:opacity-90 dark:text-content-inverse',
  link: 'text-brand-700 underline-offset-4 hover:underline dark:text-brand-300',
};

const sizes = {
  sm: 'h-9 px-3 text-body-sm',
  md: 'h-control px-4 text-body-sm',
  lg: 'h-12 px-5 text-body',
  icon: 'h-control w-control',
};

export function buttonStyles({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
} = {}) {
  return cn(
    base,
    variants[variant] ?? variants.primary,
    sizes[size] ?? sizes.md,
    fullWidth && 'w-full',
    className,
  );
}
