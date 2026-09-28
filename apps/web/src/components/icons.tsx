/**
 * Icon set.
 *
 * Hand-written inline SVG rather than an icon dependency: the set is small, it
 * inherits `currentColor`, and it keeps the bundle and the dependency tree tiny.
 */
interface IconProps {
  readonly size?: number;
  readonly className?: string;
}

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

export function OrbitIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="12" rx="9" ry="4.6" />
      <ellipse cx="12" cy="12" rx="9" ry="4.6" transform="rotate(60 12 12)" />
    </svg>
  );
}

export function SearchIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} aria-hidden="true" className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

export function HomeIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} aria-hidden="true" className={className}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function UpdatesIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} aria-hidden="true" className={className}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v4h-4" />
    </svg>
  );
}

export function LibraryIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} aria-hidden="true" className={className}>
      <path d="M4 5h4v14H4zM10 5h4v14h-4z" />
      <path d="M16.5 5.8l3.6 1.2-4 13.1-3.6-1.2z" />
    </svg>
  );
}

export function SettingsIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M4.2 7.8l2.2 1.2M17.6 15l2.2 1.2M4.2 16.2l2.2-1.2M17.6 9l2.2-1.2" />
    </svg>
  );
}

export function StarIcon({
  size = 18,
  className,
  filled = false,
}: IconProps & { filled?: boolean }) {
  return (
    <svg
      {...base(size)}
      aria-hidden="true"
      className={className}
      fill={filled ? 'currentColor' : 'none'}
    >
      <path d="M12 4.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" />
    </svg>
  );
}

export function PlugIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} aria-hidden="true" className={className}>
      <path d="M9 3v5M15 3v5" />
      <path d="M6 8h12v3a6 6 0 0 1-12 0z" />
      <path d="M12 17v4" />
    </svg>
  );
}

export function ShieldIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} aria-hidden="true" className={className}>
      <path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function LinkIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} aria-hidden="true" className={className}>
      <path d="M10 13a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7L11 6.3" />
      <path d="M14 11a4 4 0 0 0-5.7 0L6 13.3a4 4 0 0 0 5.7 5.7l1.3-1.3" />
    </svg>
  );
}

export function DownloadIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} aria-hidden="true" className={className}>
      <path d="M12 4v10" />
      <path d="M8 10.5l4 4 4-4" />
      <path d="M5 19h14" />
    </svg>
  );
}

export function AlertIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} aria-hidden="true" className={className}>
      <path d="M12 4l8.5 15h-17z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

export function CheckIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} aria-hidden="true" className={className}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function ClockIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 1.8" />
    </svg>
  );
}
