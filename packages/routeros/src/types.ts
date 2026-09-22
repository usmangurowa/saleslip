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
  bytesIn?: number;
  bytesOut?: number;
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
