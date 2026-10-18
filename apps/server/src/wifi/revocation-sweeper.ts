import type { Db } from "@turbo/api/wifi-repository";
import type { HotspotService } from "@turbo/routeros";
import { createWifiConsoleRepository } from "@turbo/api/wifi-repository";

import type { Logger } from "./logger";

export interface RevocationSweeperOptions {
  hotspot: HotspotService;
  db: Db;
  logger: Logger;
  /** Tick interval; the default matches the watchdog's one-minute cadence. */
  intervalMs?: number;
}

/**
 * Drains the deferred-revocation queue: vouchers deleted from the console
 * while the router was unreachable, whose hotspot users still need removing.
 *
 * Every minute the sweeper checks the queue; while it is empty the tick is a
 * single cheap query. When entries exist it removes each code's hotspot user
 * from the router (by exact lookup, so a stale entry cannot hit a re-minted
 * code's user unless the code itself was reused), completes what landed, and
 * leaves the rest for the next tick on a router hiccup. A code may keep
 * working on the router until its entry drains — never after.
 */
export const createRevocationSweeper = ({
  hotspot,
  db,
  logger,
  intervalMs = 60_000,
}: RevocationSweeperOptions) => {
  const repo = createWifiConsoleRepository(db);
  let timer: ReturnType<typeof setInterval> | undefined;

  const tick = async () => {
    let pending;
    try {
      pending = await repo.listPendingRevocations();
    } catch (error) {
      logger.warn("revocation sweeper could not read the queue", {
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    if (pending.length === 0) return;

    const completed: string[] = [];
    try {
      for (const entry of pending) {
        const user = await hotspot.findUser(entry.code);
        if (user) await hotspot.removeUser(user.id);
        completed.push(entry.id);
      }
    } catch (error) {
      // Router hiccup mid-drain: land what already succeeded and retry the
      // rest next tick — the queue only shrinks via completion.
      logger.warn("revocation sweeper drain interrupted", {
        applied: completed.length,
        remaining: pending.length - completed.length,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (completed.length > 0) {
        await repo.completeRevocations(completed);
        logger.info("deferred revocations applied", {
          count: completed.length,
        });
      }
    }
  };

  return {
    /** Runs one drain pass; also what the interval fires. */
    tick,
    /** Runs one tick immediately (boot drain), then on the interval. */
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
