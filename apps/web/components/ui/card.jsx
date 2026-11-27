import { cn } from './cn';

export function Card({ className, children, ...props }) {
  return (
    <section
      className={cn('rounded-card border border-line bg-surface shadow-card', className)}
      {...props}
    >
      {children}
    </section>
  );
}

export function CardHeader({ className, children, ...props }) {
  return (
    <header className={cn('flex flex-col gap-1 border-b border-line p-card', className)} {...props}>
      {children}
    </header>
  );
}

export function CardTitle({ as: Component = 'h3', className, children, ...props }) {
  return (
    <Component className={cn('text-subheading font-semibold text-content', className)} {...props}>
      {children}
    </Component>
  );
}

export function CardDescription({ className, children, ...props }) {
  return (
    <p className={cn('text-body-sm text-content-muted', className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }) {
  return (
    <div className={cn('p-card', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }) {
  return (
    <footer
      className={cn('flex flex-wrap items-center gap-3 border-t border-line p-card', className)}
      {...props}
    >
      {children}
    </footer>
  );
}
