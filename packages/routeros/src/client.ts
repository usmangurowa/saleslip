import { RouterOSAPI } from "node-routeros";

import type { RouterOsConfig, RouterOsRow, RouterOsTransport } from "./types";
import { RouterOsCommandError, RouterOsUnavailableError } from "./errors";

const DEFAULT_TIMEOUT_MS = 10_000;

const withTimeout = async <T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new RouterOsUnavailableError(`${label} timed out`)),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

// node-routeros rejects a `!trap` reply with a plain `Error(message)` and
// wraps protocol/socket faults in `RosException`, which carries `errno`.
const isTrap = (error: unknown): error is Error =>
  error instanceof Error && !("errno" in error);

const normaliseRow = (row: Record<string, unknown>): RouterOsRow => {
  const out: RouterOsRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined || value === null) continue;
    out[key] =
      typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value);
  }
  return out;
};

/**
 * Lazily-connecting RouterOS API transport with a per-command timeout.
 *
 * The underlying socket is opened on first `write`, reused while healthy, and
 * dropped on any transport error so the next call reconnects. Command errors
 * (`!trap`) surface as `RouterOsCommandError`; everything else collapses to
 * `RouterOsUnavailableError`.
 */
export const createRouterOsClient = (
  config: RouterOsConfig,
): RouterOsTransport => {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let api: RouterOSAPI | null = null;
  let connecting: Promise<RouterOSAPI> | null = null;

  const drop = () => {
    const current = api;
    api = null;
    connecting = null;
    if (current) {
      current.removeAllListeners();
      current.close().catch(() => undefined);
    }
  };

  const connect = async (): Promise<RouterOSAPI> => {
    if (api?.connected) return api;
    if (connecting) return connecting;

    const next = new RouterOSAPI({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      // node-routeros expresses its socket timeout in seconds.
      timeout: Math.max(1, Math.ceil(timeoutMs / 1000)),
      keepalive: true,
    });
    next.on("error", drop);
    next.on("close", drop);

    connecting = withTimeout(next.connect(), timeoutMs, "connect")
      .then((connected) => {
        api = connected;
        connecting = null;
        return connected;
      })
      .catch((error: unknown) => {
        connecting = null;
        next.removeAllListeners();
        throw new RouterOsUnavailableError(
          `connect to ${config.host}:${config.port} failed`,
          error,
        );
      });
    return connecting;
  };

  return {
    async write(command, params = []) {
      const conn = await connect();
      try {
        const rows = await withTimeout(
          conn.write(command, params),
          timeoutMs,
          command,
        );
        return rows.map((row) => normaliseRow(row as Record<string, unknown>));
      } catch (error) {
        if (error instanceof RouterOsUnavailableError) {
          drop();
          throw error;
        }
        if (isTrap(error)) {
          throw new RouterOsCommandError(command, error.message);
        }
        drop();
        throw new RouterOsUnavailableError(`${command} failed`, error);
      }
    },
    close() {
      drop();
      return Promise.resolve();
    },
  };
};
