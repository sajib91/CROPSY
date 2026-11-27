import { badgeStyles } from './badge-styles';

export function Badge({ tone = 'neutral', dot = false, className, children }) {
  return (
    <span className={badgeStyles({ tone, className })}>
      {dot ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-pill bg-current" /> : null}
      {children}
    </span>
  );
}
