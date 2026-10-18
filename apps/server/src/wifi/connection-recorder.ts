import type { Db } from "@turbo/api/wifi-repository";
import type { HotspotService } from "@turbo/routeros";
import { createWifiConsoleRepository } from "@turbo/api/wifi-repository";

import type { Logger } from "./logger";

export interface ConnectionRecorderOptions {
  hotspot: HotspotService;
  db: Db;
  logger: Logger;
  /** Tick interval; the default matches the watchdog's one-minute cadence. */
  intervalMs?: number;
  /** Injected for deterministic tests. */
  now?: () => Date;
}

/**
 * Records voucher usage straight off the router, once a minute, whether or
 * not anyone has the dashboard open:
 *
 * - codes in an active session get `last_connected_at` stamped, so a voucher
 *   stays on the attendance board after the customer logs off;
 * - every hotspot user's byte counters are snapshotted, so "data used" stays
 *   fresh and a code that has moved traffic is never mistaken for unused.
 *
 * Every tick is best-effort: a router or database hiccup logs a warning and
 * the next tick retries — usage recording must never take anything down.
 */
export const createConnectionRecorder = ({
  hotspot,
  db,
  logger,
  intervalMs = 60_000,
  now = () => new Date(),
}: ConnectionRecorderOptions) => {
  const repo = createWifiConsoleRepository(db);
  let timer: ReturnType<typeof setInterval> | undefined;

  const tick = async () => {
    try {
      const at = now();
      const [sessions, users] = await Promise.all([
        hotspot.listActive(),
        hotspot.listUsers(),
      ]);

      const connected = sessions
        .map((session) => session.user)
        .filter((code) => code !== "");
      if (connected.length > 0) {
        await repo.markVouchersConnected(connected, at);
      }

      const usage = new Map(
        users
          .filter((user) => user.name !== "")
          .map((user) => [
            user.name,
            {
              bytesUsed: (user.bytesIn ?? 0) + (user.bytesOut ?? 0),
              syncedAt: at,
            },
          ]),
      );
      await repo.recordUsage(usage);
    } catch (error) {
      logger.warn("connection recorder tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return {
    /** Runs one recording pass; also what the interval fires. */
    tick,
    /** Runs one tick immediately, then on the interval. */
    start: () => {
      void tick();
      timer = setInterval(() => void tick(), intervalMs);
      timer.unref();
    },
    stop: () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
};
