import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HotspotService, HotspotUser } from "@turbo/routeros";

// vi.mock is hoisted above imports, so the module under test never sees the
// real package.
import { createRevocationSweeper } from "../revocation-sweeper";

interface QueueEntry {
  id: string;
  code: string;
  rosId: string | null;
  reason: "single" | "bulk" | "batch";
  createdAt: Date;
}

const listPendingRevocations = vi.fn((): Promise<QueueEntry[]> =>
  Promise.resolve([]),
);
const completeRevocations = vi.fn((ids: string[]) =>
  Promise.resolve(ids.length),
);
const info = vi.fn();
const warn = vi.fn();

vi.mock("@turbo/api/wifi-repository", () => ({
  createWifiConsoleRepository: () => ({
    listPendingRevocations: () => listPendingRevocations(),
    completeRevocations: (ids: string[]) => completeRevocations(ids),
  }),
}));

const entry = (overrides: Partial<QueueEntry> = {}): QueueEntry => ({
  id: "q1",
  code: "LIVE-1",
  rosId: "*1",
  reason: "single",
  createdAt: new Date("2026-10-18T09:00:00Z"),
  ...overrides,
});

const fakeHotspot = (
  users: Map<string, HotspotUser>,
  fail?: Error,
): HotspotService =>
  ({
    findUser: (name: string) => {
      if (fail) return Promise.reject(fail);
      return Promise.resolve(users.get(name));
    },
    removeUser: (idOrName: string) => {
      users.delete(idOrName);
      for (const [name, user] of users) {
        if (user.id === idOrName) users.delete(name);
      }
      return Promise.resolve();
    },
  }) as unknown as HotspotService;

const logger = { info, warn } as unknown as Parameters<
  typeof createRevocationSweeper
>[0]["logger"];

describe("revocation sweeper", () => {
  beforeEach(() => {
    listPendingRevocations.mockReset();
    completeRevocations.mockClear();
    info.mockClear();
    warn.mockClear();
  });

  it("drains the queue, removing each code's hotspot user", async () => {
    const users = new Map<string, HotspotUser>([
      [
        "LIVE-1",
        {
          id: "*1",
          name: "LIVE-1",
          profile: "Saleslip-1d-1",
          disabled: false,
        },
      ],
    ]);
    listPendingRevocations.mockReturnValue(
      Promise.resolve([entry(), entry({ id: "q2", code: "GONE-1" })]),
    );
    const sweeper = createRevocationSweeper({
      hotspot: fakeHotspot(users),
      db: {} as never,
      logger,
    });

    await sweeper.tick();

    // LIVE-1's user was removed; GONE-1 had none and just completes.
    expect(users.has("LIVE-1")).toBe(false);
    expect(completeRevocations).toHaveBeenCalledWith(["q1", "q2"]);
    expect(info).toHaveBeenCalledWith("deferred revocations applied", {
      count: 2,
    });
  });

  it("keeps entries pending when the router drops before anything lands", async () => {
    listPendingRevocations.mockReturnValue(Promise.resolve([entry()]));
    const sweeper = createRevocationSweeper({
      hotspot: fakeHotspot(new Map(), new Error("connect ECONNREFUSED")),
      db: {} as never,
      logger,
    });

    await sweeper.tick();

    expect(completeRevocations).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "revocation sweeper drain interrupted",
      expect.objectContaining({ applied: 0, remaining: 1 }),
    );
  });

  it("is a no-op when the queue is empty", async () => {
    listPendingRevocations.mockReturnValue(Promise.resolve([]));
    const sweeper = createRevocationSweeper({
      hotspot: fakeHotspot(new Map()),
      db: {} as never,
      logger,
    });

    await sweeper.tick();

    expect(completeRevocations).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
