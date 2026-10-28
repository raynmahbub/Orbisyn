import {
  AppWindow,
  ArrowDownToLine,
  ArrowRight,
  BadgeCheck,
  Bell,
  Bookmark,
  BookmarkCheck,
  Box,
  Brain,
  Brush,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Cloud,
  CloudDownload,
  Code2,
  Command,
  Compass,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FileJson,
  Filter,
  Fingerprint,
  FlaskConical,
  FolderPlus,
  Gamepad2,
  GitBranch,
  Github,
  Gitlab,
  Globe,
  Heart,
  Home,
  Image,
  Info,
  Keyboard,
  KeyRound,
  Layers,
  LayoutGrid,
  Library,
  Link2,
  LockKeyhole,
  type LucideIcon,
  Mail,
  Map as MapIcon,
  Menu,
  MessageCircle,
  Monitor,
  Moon,
  Music2,
  Orbit,
  Package,
  PackageCheck,
  Palette,
  Pause,
  Pin,
  PinOff,
  Play,
  Plus,
  Podcast,
  Puzzle,
  Radio,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Terminal,
  Trash2,
  Upload,
  Users,
  Video,
  Wand2,
  Watch,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BRIDGE_BY_ID } from '../data/sources.js';
import { useStore } from '../StoreProvider.jsx';
import type { BridgeId, Platform, StoreApp } from '../types.js';

const ICONS: Readonly<Record<string, LucideIcon>> = {
  app: AppWindow,
  arrow: ArrowRight,
  badge: BadgeCheck,
  bell: Bell,
  bookmark: Bookmark,
  box: Box,
  brain: Brain,
  brush: Brush,
  check: Check,
  checkCircle: CheckCircle2,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  cloud: Cloud,
  cloudDownload: CloudDownload,
  code: Code2,
  copy: Copy,
  command: Command,
  compass: Compass,
  cpu: Cpu,
  download: Download,
  external: ExternalLink,
  fileJson: FileJson,
  filter: Filter,
  fingerprint: Fingerprint,
  flask: FlaskConical,
  folderPlus: FolderPlus,
  gamepad: Gamepad2,
  git: GitBranch,
  github: Github,
  gitlab: Gitlab,
  globe: Globe,
  heart: Heart,
  home: Home,
  image: Image,
  info: Info,
  key: KeyRound,
  keyboard: Keyboard,
  layers: Layers,
  layout: LayoutGrid,
  library: Library,
  link: Link2,
  lock: LockKeyhole,
  mail: Mail,
  map: MapIcon,
  menu: Menu,
  message: MessageCircle,
  monitor: Monitor,
  moon: Moon,
  music: Music2,
  note: FileJson,
  orbit: Orbit,
  package: Package,
  packageCheck: PackageCheck,
  palette: Palette,
  pause: Pause,
  pin: Pin,
  pinOff: PinOff,
  play: Play,
  plus: Plus,
  podcast: Podcast,
  puzzle: Puzzle,
  radio: Radio,
  refresh: RefreshCw,
  repo: Layers,
  search: Search,
  send: Send,
  settings: Settings,
  shield: ShieldCheck,
  smartphone: Smartphone,
  sparkles: Sparkles,
  star: Star,
  sun: Sun,
  sync: RefreshCw,
  terminal: Terminal,
  trash: Trash2,
  upload: Upload,
  users: Users,
  video: Video,
  wand: Wand2,
  watch: Watch,
  wifi: Wifi,
  x: X,
  zap: Zap,
  help: CircleHelp,
};

export function DynamicIcon({
  name,
  size = 20,
  className,
  strokeWidth = 1.8,
}: {
  readonly name: string;
  readonly size?: number;
  readonly className?: string;
  readonly strokeWidth?: number;
}): ReactNode {
  const Icon = ICONS[name] ?? Package;
  return <Icon size={size} className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}

export function BrandMark({ size = 34 }: { readonly size?: number }): ReactNode {
  return (
    <span className="os-brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <span className="os-brand-mark__ring" />
      <span className="os-brand-mark__core" />
      <span className="os-brand-mark__satellite" />
    </span>
  );
}

export function AppIcon({
  app,
  size = 56,
  rounded = 18,
}: {
  readonly app: StoreApp;
  readonly size?: number;
  readonly rounded?: number;
}): ReactNode {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: rounded,
    background: `linear-gradient(145deg, ${app.color}, ${app.colorAlt})`,
  };
  return (
    <span className="os-app-icon" style={style} aria-hidden="true">
      <DynamicIcon name={app.icon} size={Math.round(size * 0.48)} strokeWidth={1.9} />
      {app.verification === 'verified' && size >= 54 ? (
        <span className="os-app-icon__verified">
          <Check size={9} strokeWidth={3.4} />
        </span>
      ) : null}
    </span>
  );
}

export function SourcePill({
  id,
  short = false,
}: {
  readonly id: BridgeId;
  readonly short?: boolean;
}): ReactNode {
  const bridge = BRIDGE_BY_ID[id];
  return (
    <span className="os-source-pill" style={{ '--pill-accent': bridge.accent } as CSSProperties}>
      <span className="os-source-pill__dot" />
      {short ? bridge.lineage[0] : bridge.name}
    </span>
  );
}

export function VerificationBadge({ app }: { readonly app: StoreApp }): ReactNode {
  if (app.verification === 'verified') {
    return (
      <span className="os-badge os-badge--success">
        <BadgeCheck size={13} /> Source verified
      </span>
    );
  }
  if (app.verification === 'community') {
    return (
      <span className="os-badge os-badge--warning">
        <Users size={13} /> Community listing
      </span>
    );
  }
  return (
    <span className="os-badge os-badge--muted">
      <CircleHelp size={13} /> Review needed
    </span>
  );
}

export function PlatformIcon({
  platform,
  size = 15,
}: {
  readonly platform: Platform;
  readonly size?: number;
}): ReactNode {
  const name: Record<Platform, string> = {
    android: 'smartphone',
    ios: 'smartphone',
    windows: 'monitor',
    macos: 'monitor',
    linux: 'terminal',
    web: 'globe',
  };
  return <DynamicIcon name={name[platform]} size={size} />;
}

export function InstallButton({
  app,
  variant = 'primary',
  size = 'md',
  full = false,
}: {
  readonly app: StoreApp;
  readonly variant?: 'primary' | 'soft' | 'outline';
  readonly size?: 'sm' | 'md' | 'lg';
  readonly full?: boolean;
}): ReactNode {
  const { state, install, showToast } = useStore();
  const installed = state.installed[app.id];
  const activeJob = state.queue.find((job) => job.appId === app.id && job.status === 'active');
  const ignored = state.ignoredUpdates.includes(app.id);
  const updateReady = app.updateReady === true && !ignored && installed !== undefined;
  const sourceAvailable = app.sourceIds.some((id) => state.sourceEnabled[id] === true);

  const className = [
    'os-button',
    `os-button--${variant}`,
    `os-button--${size}`,
    full ? 'os-button--full' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handle = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!sourceAvailable) {
      showToast({
        tone: 'warning',
        title: 'Source is disabled',
        message: `Enable ${app.sourceIds[0]} in Sources to install ${app.name}.`,
      });
      return;
    }
    if (activeJob !== undefined) {
      showToast({
        tone: 'info',
        title: 'Already in the queue',
        message: `${app.name} is currently being processed.`,
      });
      return;
    }
    if (updateReady) {
      install(app, 'update');
      return;
    }
    if (installed !== undefined) {
      showToast({
        tone: 'info',
        title: 'Already in your library',
        message: 'A native Orbisyn shell will open installed apps directly.',
      });
      return;
    }
    install(app, 'install');
  };

  return (
    <button
      type="button"
      className={className}
      onClick={handle}
      aria-label={`${updateReady ? 'Update' : 'Install'} ${app.name}`}
    >
      {activeJob !== undefined ? (
        <>
          <RefreshCw size={size === 'sm' ? 14 : 17} className="os-spin" />
          {activeJob.progress}%
        </>
      ) : updateReady ? (
        <>
          <ArrowDownToLine size={size === 'sm' ? 14 : 17} /> Update
        </>
      ) : installed !== undefined ? (
        <>
          <CheckCircle2 size={size === 'sm' ? 14 : 17} /> Installed
        </>
      ) : (
        <>
          <Download size={size === 'sm' ? 14 : 17} /> Install
        </>
      )}
    </button>
  );
}

export function WishlistButton({
  app,
  compact = false,
}: {
  readonly app: StoreApp;
  readonly compact?: boolean;
}): ReactNode {
  const { state, toggleWishlist, showToast } = useStore();
  const active = state.wishlist.includes(app.id);
  return (
    <button
      type="button"
      className={`os-icon-button ${active ? 'os-icon-button--active' : ''}`}
      aria-label={active ? `Remove ${app.name} from wishlist` : `Add ${app.name} to wishlist`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleWishlist(app.id);
        showToast({
          tone: 'info',
          title: active ? 'Removed from wishlist' : 'Saved for later',
          message: `${app.name} ${active ? 'was removed from' : 'was added to'} your wishlist.`,
        });
      }}
    >
      {active ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
      {compact ? null : <span>{active ? 'Saved' : 'Save'}</span>}
    </button>
  );
}

export function AppCard({
  app,
  variant = 'default',
}: {
  readonly app: StoreApp;
  readonly variant?: 'default' | 'compact' | 'feature';
}): ReactNode {
  const { state } = useStore();
  const installed = state.installed[app.id] !== undefined;
  const wishlisted = state.wishlist.includes(app.id);
  return (
    <Link to={`/app/${app.id}`} className={`os-app-card os-app-card--${variant}`}>
      <div className="os-app-card__top">
        <AppIcon app={app} size={variant === 'feature' ? 72 : 58} />
        <div className="os-app-card__identity">
          <div className="os-app-card__title-row">
            <h3>{app.name}</h3>
            {wishlisted ? <Heart size={14} className="os-app-card__heart" /> : null}
          </div>
          <p>{app.developer}</p>
        </div>
      </div>
      <p className="os-app-card__tagline">{app.tagline}</p>
      <div className="os-app-card__meta">
        <span className="os-app-card__platforms">
          {app.platforms.slice(0, 4).map((platform) => (
            <span key={platform} title={platform}>
              <PlatformIcon platform={platform} size={14} />
            </span>
          ))}
        </span>
        <span className="os-app-card__license">
          {app.openSource ? app.license : 'Closed source'}
        </span>
      </div>
      <div className="os-app-card__sources">
        {app.sourceIds.slice(0, 3).map((source) => (
          <SourcePill key={source} id={source} short />
        ))}
        {app.sourceIds.length > 3 ? (
          <span className="os-more">+{app.sourceIds.length - 3}</span>
        ) : null}
      </div>
      <div className="os-app-card__footer">
        <div className="os-app-card__flags">
          {app.verification === 'verified' ? (
            <span className="os-mini-badge">
              <ShieldCheck size={12} /> Verified
            </span>
          ) : (
            <span className="os-mini-badge os-mini-badge--muted">Community</span>
          )}
          {app.fresh === true ? (
            <span className="os-mini-badge os-mini-badge--fresh">Fresh</span>
          ) : null}
          {installed ? (
            <span className="os-mini-badge os-mini-badge--installed">On device</span>
          ) : null}
        </div>
        <InstallButton app={app} size="sm" />
      </div>
    </Link>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}): ReactNode {
  return (
    <div className="os-section-heading">
      <div>
        {eyebrow !== undefined ? <span className="os-eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description !== undefined ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  icon,
  disabled = false,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  readonly description?: string;
  readonly icon?: string;
  readonly disabled?: boolean;
}): ReactNode {
  return (
    <label className={`os-toggle-row ${disabled ? 'os-toggle-row--disabled' : ''}`}>
      <span className="os-toggle-row__copy">
        {icon !== undefined ? (
          <span className="os-toggle-row__icon">
            <DynamicIcon name={icon} size={18} />
          </span>
        ) : null}
        <span>
          <strong>{label}</strong>
          {description !== undefined ? <small>{description}</small> : null}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="os-toggle" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}

export function EmptyState({
  icon = 'package',
  title,
  message,
  action,
}: {
  readonly icon?: string;
  readonly title: string;
  readonly message: string;
  readonly action?: ReactNode;
}): ReactNode {
  return (
    <div className="os-empty">
      <span className="os-empty__icon">
        <DynamicIcon name={icon} size={30} />
      </span>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}

export function ScreenshotPreview({
  app,
  index,
}: {
  readonly app: StoreApp;
  readonly index: number;
}): ReactNode {
  const shot = app.screenshots[index % app.screenshots.length] ?? app.screenshots[0];
  return (
    <div
      className="os-screenshot"
      style={
        {
          '--shot-a': app.color,
          '--shot-b': app.colorAlt,
        } as CSSProperties
      }
    >
      <div className="os-screenshot__chrome">
        <span />
        <span />
        <span />
        <small>{app.name}</small>
      </div>
      <div className="os-screenshot__body">
        <div className="os-screenshot__orb">
          <DynamicIcon name={app.icon} size={42} />
        </div>
        <strong>{shot?.title}</strong>
        <p>{shot?.body}</p>
        <div className="os-screenshot__lines">
          <span />
          <span />
          <span />
        </div>
        <div className="os-screenshot__button" />
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  children,
  size = 'md',
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly size?: 'sm' | 'md' | 'lg';
}): ReactNode {
  if (!open) return null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop closes the modal; the dialog inside owns interaction.
    <div className="os-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className={`os-modal os-modal--${size}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="os-modal__close os-icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={19} />
        </button>
        {children}
      </div>
    </div>
  );
}

export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  readonly tabs: readonly { id: T; label: string; count?: number }[];
  readonly active: T;
  readonly onChange: (id: T) => void;
}): ReactNode {
  return (
    <div className="os-tabbar" role="tablist">
      {tabs.map((tab) => (
        <button
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          key={tab.id}
          className={active === tab.id ? 'os-tabbar__tab is-active' : 'os-tabbar__tab'}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined ? <span>{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
