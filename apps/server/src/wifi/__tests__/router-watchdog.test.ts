import { describe, expect, it } from "vitest";

import { noopLogger } from "../logger";
import { createRouterWatchdog } from "../router-watchdog";
import { createFakeHotspot } from "./helpers";

describe("router watchdog", () => {
  const setup = () => {
    const fake = createFakeHotspot();
    let clock = new Date("2025-01-15T10:00:00Z");
    const alerts: string[] = [];
    const watchdog = createRouterWatchdog({
      hotspot: fake.hotspot,
      logger: noopLogger,
      notify: (text) => {
        alerts.push(text);
        return Promise.resolve();
      },
      thresholdMs: 5 * 60_000,
      now: () => clock,
    });
    const advance = (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    };
    return { fake, watchdog, alerts, advance };
  };

  it("alerts once after the threshold and again on recovery", async () => {
    const { fake, watchdog, alerts, advance } = setup();
    await watchdog.check();
    expect(watchdog.state.downSince).toBeNull();

    fake.state.fail = new Error("ETIMEDOUT");
    await watchdog.check();
    expect(watchdog.state.downSince).not.toBeNull();
    expect(alerts).toEqual([]);

    advance(4 * 60_000);
    await watchdog.check();
    expect(alerts).toEqual([]);

    advance(60_000);
    await watchdog.check();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("unreachable for 5 min");
    expect(alerts[0]).toContain("ETIMEDOUT");

    advance(60_000);
    await watchdog.check();
    expect(alerts).toHaveLength(1);

    fake.state.fail = undefined;
    await watchdog.check();
    expect(alerts).toHaveLength(2);
    expect(alerts[1]).toContain("reachable again");
    expect(watchdog.state.alerted).toBe(false);
  });

  it("does not report a recovery for a blip shorter than the threshold", async () => {
    const { fake, watchdog, alerts, advance } = setup();
    fake.state.fail = new Error("blip");
    await watchdog.check();
    advance(60_000);
    fake.state.fail = undefined;
    await watchdog.check();
    expect(alerts).toEqual([]);
    expect(watchdog.state.downSince).toBeNull();
  });
});
