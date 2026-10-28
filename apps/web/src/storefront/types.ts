/**
 * Product model for the Orbisyn Store.
 *
 * This is deliberately separate from the canonical resolution model in
 * `@orbisyn/core`: the store adds editorial presentation and local device state,
 * while live upstream facts always come from the resolver. Fields prefixed with
 * `demo` are explicitly preview data and are labelled as such in the UI.
 */

export type Platform = 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'web';

export type BridgeId =
  | 'forge'
  | 'komi'
  | 'droidify'
  | 'obtainium'
  | 'aurora'
  | 'community'
  | 'direct';

export type SourceMode = 'live' | 'bridge' | 'custom' | 'handoff';

export type Category =
  | 'Privacy'
  | 'Communication'
  | 'Productivity'
  | 'Creativity'
  | 'Media'
  | 'Developer'
  | 'Games'
  | 'Navigation'
  | 'Utilities';

export type Verification = 'verified' | 'community' | 'review';

export interface BridgeDefinition {
  readonly id: BridgeId;
  readonly name: string;
  readonly eyebrow: string;
  readonly lineage: readonly string[];
  readonly mode: SourceMode;
  readonly description: string;
  readonly capabilities: readonly string[];
  readonly platforms: readonly string[];
  readonly enabledByDefault: boolean;
  readonly accent: string;
  readonly icon: string;
  readonly requirement: string;
  readonly note: string;
}

export interface StoreApp {
  readonly id: string;
  readonly name: string;
  readonly developer: string;
  readonly tagline: string;
  readonly description: string;
  readonly category: Category;
  readonly platforms: readonly Platform[];
  readonly sourceIds: readonly BridgeId[];
  /** A reference accepted by the real provider engine, used by “Verify live”. */
  readonly reference: string;
  /** The human-facing upstream page. */
  readonly sourceUrl: string;
  readonly license: string;
  readonly openSource: boolean;
  readonly verification: Verification;
  readonly icon: string;
  readonly color: string;
  readonly colorAlt: string;
  readonly formats: readonly string[];
  readonly permissions: readonly string[];
  readonly highlights: readonly string[];
  readonly checks: readonly string[];
  readonly releaseNotes: readonly string[];
  readonly screenshots: readonly { title: string; body: string }[];
  readonly featured?: boolean;
  readonly trending?: boolean;
  readonly editorsChoice?: boolean;
  readonly fresh?: boolean;
  readonly updateReady?: boolean;
  /** False for companion-only listings that have no public resolver endpoint. */
  readonly liveResolve?: boolean;
  readonly demoVersion: string;
  readonly demoPreviousVersion: string;
  readonly demoSize: string;
  readonly demoUpdated: string;
}

export interface CustomSource {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly kind: string;
  readonly bridgeId: BridgeId;
  readonly addedAt: string;
  readonly status: 'connected' | 'pending' | 'session-required';
}

export interface ExternalApp {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly sourceName: string;
  readonly packageId?: string;
  readonly addedAt: string;
}

export interface InstalledEntry {
  readonly appId: string;
  readonly version: string;
  readonly sourceId: BridgeId;
  readonly installedAt: string;
  readonly autoUpdate: boolean;
  readonly pinned: boolean;
}

export interface InstallJob {
  readonly id: string;
  readonly appId: string;
  readonly appName: string;
  readonly version: string;
  readonly sourceId: BridgeId;
  readonly kind: 'install' | 'update';
  readonly progress: number;
  readonly status: 'active' | 'done' | 'failed';
  readonly createdAt: string;
}

export interface StoreToast {
  readonly id: string;
  readonly tone: 'success' | 'info' | 'warning' | 'error';
  readonly title: string;
  readonly message: string;
}

export interface StoreNotification {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly createdAt: string;
  readonly read: boolean;
  readonly tone: 'success' | 'info' | 'warning';
}

export interface Collection {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly appIds: readonly string[];
  readonly color: string;
}

export interface Settings {
  readonly theme: 'dark' | 'light' | 'system';
  readonly compact: boolean;
  readonly reducedMotion: boolean;
  readonly autoUpdate: boolean;
  readonly wifiOnly: boolean;
  readonly prereleases: boolean;
  readonly parallelDownloads: boolean;
  readonly installMethod: 'system' | 'session' | 'shizuku' | 'root' | 'manual';
  readonly signatureCheck: boolean;
  readonly checksumCheck: boolean;
  readonly sourcePinning: boolean;
  readonly quarantineUnknown: boolean;
  readonly telemetry: boolean;
  readonly gatewayUrl: string;
}

export interface StoreState {
  readonly installed: Readonly<Record<string, InstalledEntry>>;
  readonly wishlist: readonly string[];
  readonly tracked: readonly string[];
  readonly ignoredUpdates: readonly string[];
  readonly collections: readonly Collection[];
  readonly customSources: readonly CustomSource[];
  readonly externalApps: readonly ExternalApp[];
  readonly sourceEnabled: Readonly<Record<BridgeId, boolean>>;
  readonly settings: Settings;
  readonly queue: readonly InstallJob[];
  readonly toasts: readonly StoreToast[];
  readonly notifications: readonly StoreNotification[];
  readonly onboardingSeen: boolean;
}
