import { z } from 'zod';

/**
 * Configuration.
 *
 * Parsed once, at boot, with a schema — a mistyped port or a stray space in a
 * token must fail the deployment immediately, not the first request at 03:00.
 * Absent optional values produce the documented local defaults (in-memory cache
 * and store) so `npm run dev` works on a clean checkout.
 *
 * The environment names live in one table (`ENV_VAR_MAP`) because a variable
 * that the process reads but nobody documents — or documents but never reads —
 * is indistinguishable from a broken deployment. The test suite checks that
 * table against `.env.example` in both directions.
 */

const CsvSchema = z
  .string()
  .optional()
  .transform((value) =>
    value === undefined
      ? []
      : value
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
  );

/**
 * `host=token` pairs for self-hosted forges. Malformed entries are dropped
 * rather than rejecting the whole document: one bad token must not stop the
 * other forges from working.
 */
const ForgeTokensSchema = CsvSchema.transform((entries) => {
  const tokens: Record<string, string> = {};
  for (const entry of entries) {
    const separator = entry.indexOf('=');
    if (separator <= 0) continue;
    const host = entry.slice(0, separator).trim().toLowerCase();
    const token = entry.slice(separator + 1).trim();
    if (token.length > 0) tokens[host] = token;
  }
  return tokens;
});

export const GatewayConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  host: z.string().min(1).default('0.0.0.0'),
  /** `0` asks the operating system for a free port (tests, embedded use). */
  port: z.coerce.number().int().min(0).max(65_535).default(8787),
  logLevel: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  /** `*` allows any origin; otherwise an exact allowlist. */
  corsOrigins: CsvSchema,
  /** Requests per window per address; `0` disables the limiter entirely. */
  rateLimitMax: z.coerce.number().int().min(0).default(120),
  rateLimitWindowMs: z.coerce.number().int().min(1_000).default(60_000),
  cacheTtlSeconds: z.coerce.number().int().min(0).default(300),
  cacheMaxEntries: z.coerce.number().int().min(16).default(2_000),
  httpTimeoutMs: z.coerce.number().int().min(1_000).default(10_000),
  githubToken: z.string().min(1).optional(),
  gitlabToken: z.string().min(1).optional(),
  forgeTokens: ForgeTokensSchema,
  /** Self-hosted forge hosts to enable, e.g. `forgejo.example.org`. */
  forgeHosts: CsvSchema,
  /** Directory holding a built web client; served when it exists. */
  webRoot: z.string().min(1).optional(),
  buildVersion: z.string().min(1).default('0.1.0-dev.0'),
});

export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;

/**
 * Every environment variable the gateway understands, mapped to the config key
 * it feeds. Anything not listed here is ignored, whatever `.env` contains.
 */
export const ENV_VAR_MAP = {
  NODE_ENV: 'nodeEnv',
  LOG_LEVEL: 'logLevel',
  GATEWAY_HOST: 'host',
  GATEWAY_PORT: 'port',
  GATEWAY_CORS_ORIGINS: 'corsOrigins',
  GATEWAY_RATE_LIMIT_MAX: 'rateLimitMax',
  GATEWAY_RATE_LIMIT_WINDOW_MS: 'rateLimitWindowMs',
  GATEWAY_CACHE_TTL_SECONDS: 'cacheTtlSeconds',
  GATEWAY_CACHE_MAX_ENTRIES: 'cacheMaxEntries',
  GATEWAY_HTTP_TIMEOUT_MS: 'httpTimeoutMs',
  GITHUB_TOKEN: 'githubToken',
  GITLAB_TOKEN: 'gitlabToken',
  ORBISYN_FORGE_TOKENS: 'forgeTokens',
  ORBISYN_FORGE_HOSTS: 'forgeHosts',
  ORBISYN_WEB_ROOT: 'webRoot',
  ORBISYN_VERSION: 'buildVersion',
} as const satisfies Record<string, keyof GatewayConfig>;

/** List-valued keys read the raw string; everything else treats blanks as absent. */
const LIST_KEYS: ReadonlySet<string> = new Set(['corsOrigins', 'forgeTokens', 'forgeHosts']);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const raw: Record<string, string | undefined> = {};
  for (const [name, key] of Object.entries(ENV_VAR_MAP)) {
    const value = env[name];
    raw[key] = LIST_KEYS.has(key) ? value : emptyToUndefined(value);
  }

  const parsed = GatewayConfigSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || 'config'}: ${issue.message}`)
      .join('\n');
    throw new Error(`invalid gateway configuration:\n${issues}`);
  }

  return parsed.data;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim().length === 0 ? undefined : value.trim();
}
