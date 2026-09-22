import type { HotspotService } from "@turbo/routeros";

import type { Logger } from "./logger";

export const DEFAULT_WATCHDOG_INTERVAL_MS = 60_000;
export const DEFAULT_WATCHDOG_THRESHOLD_MS = 5 * 60_000;

export interface RouterWatchdogOptions {
  hotspot: HotspotService;
  /** Delivers an owner alert; must not throw. */
  notify: (text: string) => Promise<void>;
  logger: Logger;
  intervalMs?: number;
  thresholdMs?: number;
  now?: () => Date;
}

export interface RouterWatchdog {
  /** Probe the router once and update alert state. */
  check: () => Promise<void>;
  start: () => void;
  stop: () => void;
  readonly state: Readonly<{
    downSince: Date | null;
    alerted: boolean;
    lastError: string | null;
  }>;
}

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const formatDuration = (ms: number) => {
  const minutes = Math.round(ms / 60_000);
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

/**
 * Polls `/system/resource` and alerts the owner once the router has been
 * unreachable for longer than the threshold, then again when it recovers.
 */
export const createRouterWatchdog = ({
  hotspot,
  notify,
  logger,
  intervalMs = DEFAULT_WATCHDOG_INTERVAL_MS,
  thresholdMs = DEFAULT_WATCHDOG_THRESHOLD_MS,
  now = () => new Date(),
}: RouterWatchdogOptions): RouterWatchdog => {
  const state = {
    downSince: null as Date | null,
    alerted: false,
    lastError: null as string | null,
  };
  let timer: NodeJS.Timeout | undefined;

  const check = async () => {
    const at = now();
    try {
      await hotspot.systemResource();
    } catch (error) {
      state.lastError = describe(error);
      state.downSince ??= at;
      const downFor = at.getTime() - state.downSince.getTime();
      logger.warn("router unreachable", {
        downForMs: downFor,
        error: state.lastError,
      });
      if (!state.alerted && downFor >= thresholdMs) {
        state.alerted = true;
        await notify(
          `⚠️ Router unreachable for ${formatDuration(downFor)}.\nLast error: ${state.lastError}\nNew vouchers will be queued until it is back.`,
        );
      }
      return;
    }

    if (state.downSince) {
      const downFor = at.getTime() - state.downSince.getTime();
      logger.info("router reachable again", { downForMs: downFor });
      if (state.alerted) {
        await notify(
          `✅ Router is reachable again after ${formatDuration(downFor)}.`,
        );
      }
    }
    state.downSince = null;
    state.alerted = false;
    state.lastError = null;
  };

  return {
    check,
    start: () => {
      if (timer) return;
      timer = setInterval(() => void check(), intervalMs);
      timer.unref();
      void check();
    },
    stop: () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
    state,
  };
};
