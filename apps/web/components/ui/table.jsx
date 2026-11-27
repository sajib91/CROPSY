import { cn } from './cn';

export function Table({ caption, dense = false, className, children, ...props }) {
  return (
    <div className="w-full overflow-x-auto rounded-card border border-line bg-surface shadow-card">
      <table
        className={cn(
          'w-full min-w-[36rem] border-collapse text-left',
          dense && '[&_td]:py-2 [&_th]:py-2',
          className,
        )}
        {...props}
      >
        {caption ? <TableCaption>{caption}</TableCaption> : null}
        {children}
      </table>
    </div>
  );
}

export function TableCaption({ className, children, ...props }) {
  return (
    <caption
      className={cn('px-4 py-3 text-left text-caption text-content-muted', className)}
      {...props}
    >
      {children}
    </caption>
  );
}

export function TableHeader({ className, children, ...props }) {
  return (
    <thead className={cn('border-b border-line bg-surface-muted', className)} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({ className, children, ...props }) {
  return (
    <tbody className={cn('divide-y divide-line', className)} {...props}>
      {children}
    </tbody>
  );
}

export function TableFooter({ className, children, ...props }) {
  return (
    <tfoot className={cn('border-t border-line bg-surface-muted', className)} {...props}>
      {children}
    </tfoot>
  );
}

export function TableRow({ interactive = false, className, children, ...props }) {
  return (
    <tr
      className={cn(interactive && 'transition-colors hover:bg-surface-muted', className)}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableHead({ className, children, ...props }) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap px-4 py-3 text-caption font-semibold uppercase tracking-wider text-content-muted',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableCell({ className, children, ...props }) {
  return (
    <td className={cn('px-4 py-3 align-middle text-body-sm text-content', className)} {...props}>
      {children}
    </td>
  );
}
