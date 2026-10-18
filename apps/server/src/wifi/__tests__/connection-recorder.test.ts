import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HotspotService, HotspotUser } from "@turbo/routeros";

// Imported after the mock declaration reads better, but vi.mock is hoisted
// above imports anyway — the module under test never sees the real package.
import { createConnectionRecorder } from "../connection-recorder";

const markVouchersConnected = vi.fn(async () => 1);
const recordUsage = vi.fn(async () => 2);
const warn = vi.fn();

vi.mock("@turbo/api/wifi-repository", () => ({
  createWifiConsoleRepository: () => ({
    markVouchersConnected: (codes: readonly string[], at: Date) =>
      markVouchersConnected(codes, at),
    recordUsage: (usage: Map<string, unknown>) => recordUsage(usage),
  }),
}));

const fakeHotspot = (
  sessionUsers: string[],
  users: Partial<HotspotUser>[],
  fail?: Error,
): HotspotService =>
  ({
    listActive: async () =>
      fail
        ? Promise.reject(fail)
        : sessionUsers.map((user, i) => ({ id: `*${i}`, user })),
    listUsers: async () => (fail ? Promise.reject(fail) : users),
  }) as unknown as HotspotService;

const logger = { warn } as unknown as Parameters<
  typeof createConnectionRecorder
>[0]["logger"];

describe("connection recorder", () => {
  beforeEach(() => {
    markVouchersConnected.mockClear();
    recordUsage.mockClear();
    warn.mockClear();
  });

  it("stamps connected codes and snapshots usage every tick", async () => {
    const at = new Date("2026-10-18T09:00:00Z");
    const recorder = createConnectionRecorder({
      hotspot: fakeHotspot(
        ["SLJB3ZV", "SLWF3XK"],
        [
          { name: "SLJB3ZV", bytesIn: 1000, bytesOut: 500 },
          { name: "SLWF3XK", bytesIn: 0, bytesOut: 0 },
          { name: "", bytesIn: 9, bytesOut: 9 },
        ],
      ),
      db: {} as never,
      logger,
      now: () => at,
    });

    await recorder.tick();

    expect(markVouchersConnected).toHaveBeenCalledWith(
      ["SLJB3ZV", "SLWF3XK"],
      at,
    );
    expect(recordUsage).toHaveBeenCalledWith(
      new Map([
        ["SLJB3ZV", { bytesUsed: 1500, syncedAt: at }],
        ["SLWF3XK", { bytesUsed: 0, syncedAt: at }],
      ]),
    );
  });

  it("skips the connected stamp when nobody is online", async () => {
    const recorder = createConnectionRecorder({
      hotspot: fakeHotspot([], [{ name: "SLJB3ZV", bytesIn: 10, bytesOut: 0 }]),
      db: {} as never,
      logger,
    });

    await recorder.tick();

    expect(markVouchersConnected).not.toHaveBeenCalled();
    expect(recordUsage).toHaveBeenCalled();
  });

  it("survives a router outage with a warning instead of throwing", async () => {
    const recorder = createConnectionRecorder({
      hotspot: fakeHotspot([], [], new Error("connect ECONNREFUSED")),
      db: {} as never,
      logger,
    });

    await expect(recorder.tick()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      "connection recorder tick failed",
      expect.objectContaining({ error: "connect ECONNREFUSED" }),
    );
  });
});
