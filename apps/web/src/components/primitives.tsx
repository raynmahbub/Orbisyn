import type { ReactNode } from 'react';
import { AlertIcon } from './icons.js';

/** Small, reusable presentation primitives shared by every screen. */

export function Chip({
  children,
  active = false,
  onClick,
  title,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  if (onClick === undefined) {
    return (
      <span className={`chip chip--static${active ? ' chip--active' : ''}`} title={title}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`chip${active ? ' chip--active' : ''}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'error' | 'primary';

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span className="text-sm">{description}</span>
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  detail,
  onRetry,
  warning = false,
}: {
  title: string;
  detail: string;
  onRetry?: () => void;
  warning?: boolean;
}) {
  return (
    <div className={`alert ${warning ? 'alert--warning' : 'alert--error'}`} role="alert">
      <span className="row row--tight">
        <AlertIcon />
        <span className="alert__title">{title}</span>
      </span>
      <p className="text-sm text-muted">{detail}</p>
      {onRetry !== undefined && (
        <div className="row">
          <button type="button" className="button button--sm" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="row row--between" style={{ alignItems: 'flex-end' }}>
      <div className="stack stack--tight">
        <h2>{title}</h2>
        {description !== undefined && <p className="text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const SKELETON_SLOTS = [
  's1',
  's2',
  's3',
  's4',
  's5',
  's6',
  's7',
  's8',
  's9',
  's10',
  's11',
  's12',
] as const;
const LINE_SLOTS = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8'] as const;

export function CardSkeletons({ count = 6 }: { count?: number }) {
  return (
    <div className="grid" aria-hidden="true">
      {SKELETON_SLOTS.slice(0, count).map((slot) => (
        <div key={slot} className="skeleton skeleton--card" />
      ))}
    </div>
  );
}

export function LineSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="stack stack--tight" aria-hidden="true">
      {LINE_SLOTS.slice(0, lines).map((slot, index) => (
        <div
          key={slot}
          className="skeleton skeleton--line"
          style={{ width: `${100 - index * 12}%` }}
        />
      ))}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stack stack--tight">
      <span
        className="text-xs text-subtle"
        style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
      >
        {label}
      </span>
      <span style={{ fontSize: 'var(--text-lg)', fontWeight: 650 }}>{value}</span>
      {hint !== undefined && <span className="text-xs text-subtle">{hint}</span>}
    </div>
  );
}
