export interface RouterOsConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  /** Per-command timeout in milliseconds. Defaults to 10s. */
  timeoutMs?: number;
}

/** One `!re` sentence from the API, keys as RouterOS prints them. */
export type RouterOsRow = Record<string, string>;

export interface HotspotUserInput {
  name: string;
  password: string;
  profile: string;
  comment?: string;
  /** Total transfer allowance in bytes (`limit-bytes-total`). */
  limitBytesTotal?: number;
  /** RouterOS duration such as `1d`, `12h`, `30m` (`limit-uptime`). */
  limitUptime?: string;
  /** Hotspot server name; omit for `all`. */
  server?: string;
}

export interface HotspotUser {
  id: string;
  name: string;
  profile: string;
  comment?: string;
  disabled: boolean;
  uptime?: string;
  bytesIn?: number;
  bytesOut?: number;
  limitBytesTotal?: number;
  limitUptime?: string;
}

export interface HotspotActiveSession {
  id: string;
  user: string;
  address?: string;
  macAddress?: string;
  uptime?: string;
  /** Time until the profile's session-timeout ends the session, e.g. `23h59m`. */
  sessionTimeLeft?: string;
  bytesIn?: number;
  bytesOut?: number;
}

/**
 * A `/ip/hotspot/host` entry: every device the hotspot has seen, logged in or
 * not. `authorized` is false until the device logs in with a voucher.
 */
export interface HotspotHost {
  id: string;
  macAddress?: string;
  address?: string;
  authorized: boolean;
  /** IP-binding bypass: the device skips the login page entirely. */
  bypassed: boolean;
}

/** A `/ip/hotspot/user/profile` entry as printed by the router. */
export interface HotspotProfile {
  id: string;
  name: string;
  /** RouterOS rate expression such as `5M/5M`, unset means unlimited. */
  rateLimit?: string;
  sharedUsers?: number;
  /** RouterOS duration such as `1d`, unset means unlimited. */
  sessionTimeout?: string;
}

/** Writable profile fields; omits on-login script and other risky knobs. */
export interface HotspotProfileInput {
  name?: string;
  rateLimit?: string;
  sharedUsers?: number;
  sessionTimeout?: string;
}

export interface SystemResource {
  uptime?: string;
  version?: string;
  boardName?: string;
  cpuLoad?: number;
  freeMemory?: number;
  totalMemory?: number;
  freeHddSpace?: number;
  totalHddSpace?: number;
}

/** Minimal transport used by the hotspot helpers; lets tests stub the wire. */
export interface RouterOsTransport {
  write: (command: string, params?: string[]) => Promise<RouterOsRow[]>;
  close: () => Promise<void>;
}
