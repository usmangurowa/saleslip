import { describe, expect, it, vi } from "vitest";

import type {
  HotspotActiveSession,
  HotspotProfile,
  HotspotService,
  HotspotUser,
  SystemResource,
} from "@turbo/routeros";
import {
  RouterOsCommandError,
  RouterOsUnavailableError,
} from "@turbo/routeros";

import type { AuthWithApi, Db } from "../context";
import type * as repositoryModule from "../wifi/repository";
import { VoucherActivationError } from "../wifi/activation-errors";

/**
 * The route layer is what these tests cover: auth, status mapping, and the
 * router calls. Persistence is stubbed so no database is needed — the SQL
 * itself is exercised by the migration, not by an HTTP assertion.
 */
const state = vi.hoisted(
  (): { repo: Partial<repositoryModule.WifiConsoleRepository> } => ({
    repo: {},
  }),
);

vi.mock("../wifi/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof repositoryModule>();
  return {
    ...actual,
    createWifiConsoleRepository: () =>
      state.repo as repositoryModule.WifiConsoleRepository,
  };
});

const { createWifiRouterApp } = await import("../router/wifi-router");

// The admin console gates on ADMIN_EMAILS; seed it so the default mock user
// is an admin, and so the non-admin 403 case has a clear contrast value.
process.env.ADMIN_EMAILS = "u@example.com";

const user = { id: "u1", email: "u@example.com", name: "U" };

const auth = (signedIn: boolean, email = user.email): AuthWithApi =>
  ({
    api: {
      getSession: () =>
        Promise.resolve(
          signedIn ? { user: { ...user, email }, session: {} } : null,
        ),
    },
  }) as unknown as AuthWithApi;

const sampleResource: SystemResource = {
  uptime: "1d2h",
  version: "7.19.6",
  boardName: "hEX",
};

const sampleProfiles: HotspotProfile[] = [
  { id: "*1", name: "Daily-1GB", rateLimit: "5M/5M", sharedUsers: 2 },
  { id: "*2", name: "default" },
].map((entry) => ({ ...entry }));

const sampleSession = (overrides: Partial<HotspotActiveSession> = {}) =>
  ({
    id: "*1",
    user: "SALE-1234",
    address: "10.5.50.2",
    uptime: "5m",
    bytesIn: 100,
    bytesOut: 200,
    ...overrides,
  }) satisfies HotspotActiveSession;

/** Scriptable `HotspotService`; `state.fail` makes every call reject. */
const createFakeHotspot = () => {
  const users = new Map<string, HotspotUser>();
  const calls: string[] = [];
  const state: {
    fail: Error | undefined;
    active: HotspotActiveSession[];
    /** Whether the fake router can reach the internet. */
    wan: boolean;
  } = {
    fail: undefined,
    active: [],
    wan: true,
  };
  let seq = 0;

  const guard = () => {
    if (state.fail) return Promise.reject(state.fail);
    return Promise.resolve();
  };

  const hotspot: HotspotService = {
    createHotspotUser: async (input) => {
      calls.push(`create:${input.name}`);
      await guard();
      const id = `*${(++seq).toString(16).toUpperCase()}`;
      users.set(input.name, {
        id,
        name: input.name,
        profile: input.profile,
        comment: input.comment,
        disabled: false,
        limitBytesTotal: input.limitBytesTotal,
        limitUptime: input.limitUptime,
      });
      return { id };
    },
    listUsers: async () => {
      calls.push("listUsers");
      await guard();
      return [...users.values()];
    },
    findUser: async (name) => {
      calls.push(`find:${name}`);
      await guard();
      return users.get(name);
    },
    listActive: async () => {
      await guard();
      return state.active;
    },
    listProfiles: async () => {
      await guard();
      return sampleProfiles;
    },
    createProfile: async (input) => {
      calls.push(`createProfile:${input.name ?? ""}`);
      await guard();
      const id = `*p${++seq}`;
      const profile: HotspotProfile = {
        id,
        name: input.name ?? "",
        rateLimit: input.rateLimit,
        sharedUsers: input.sharedUsers,
        sessionTimeout: input.sessionTimeout,
      };
      sampleProfiles.push(profile);
      return { id };
    },
    updateProfile: async (id, input) => {
      calls.push(`updateProfile:${id}`);
      await guard();
      const index = sampleProfiles.findIndex((p) => p.id === id);
      const current = sampleProfiles[index];
      if (current) sampleProfiles[index] = { ...current, ...input };
    },
    removeProfile: async (idOrName) => {
      calls.push(`removeProfile:${idOrName}`);
      await guard();
      const index = sampleProfiles.findIndex(
        (p) => p.id === idOrName || p.name === idOrName,
      );
      if (index >= 0) sampleProfiles.splice(index, 1);
    },
    removeUser: async (idOrName) => {
      calls.push(`remove:${idOrName}`);
      await guard();
      // The router accepts either the id or the name, so the fake must too.
      users.delete(idOrName);
      for (const [name, entry] of users) {
        if (entry.id === idOrName) users.delete(name);
      }
    },
    kick: async (name) => {
      calls.push(`kick:${name}`);
      await guard();
      return 1;
    },
    systemResource: async () => {
      await guard();
      return sampleResource;
    },
    wanReachable: async () => {
      calls.push("ping");
      await guard();
      return state.wan;
    },
  };

  return { hotspot, users, calls, state };
};

const voucherRow = (overrides: Partial<repositoryModule.WifiVoucherRow> = {}) =>
  ({
    id: "voucher-1",
    orderId: null,
    batchId: "batch-1",
    code: "SALE-1234",
    profile: "Saleslip-1d-1",
    kind: "primary",
    channel: "manual",
    rosId: null,
    limitBytesTotal: null,
    status: "active",
    activatedAt: null,
    bytesUsed: 0,
    syncedAt: null,
    lastError: null,
    createdAt: new Date("2025-01-15T10:00:00Z"),
    ...overrides,
  }) satisfies repositoryModule.WifiVoucherRow;

const build = ({
  hotspot,
  signedIn = true,
  email,
  repo = {},
}: {
  hotspot?: HotspotService;
  signedIn?: boolean;
  email?: string;
  repo?: Partial<repositoryModule.WifiConsoleRepository>;
} = {}) => {
  state.repo = repo;
  return createWifiRouterApp({
    auth: auth(signedIn, email),
    db: {} as Db,
    hotspot,
    now: () => new Date("2025-01-15T10:00:00Z"),
  });
};

const json = async (res: Response) =>
  (await res.json()) as Record<string, unknown>;

describe("wifi router console auth", () => {
  it("rejects unauthenticated requests", async () => {
    const app = build({
      hotspot: createFakeHotspot().hotspot,
      signedIn: false,
    });
    const res = await app.request("/health");
    expect(res.status).toBe(401);
  });

  it("rejects authenticated non-admins with 403", async () => {
    const app = build({
      hotspot: createFakeHotspot().hotspot,
      email: "intruder@example.com",
    });
    const res = await app.request("/health");
    expect(res.status).toBe(403);
  });

  it("503s every router-backed route when no router is configured", async () => {
    const app = build({ hotspot: undefined });
    for (const [method, path] of [
      ["GET", "/health"],
      ["GET", "/profiles"],
      ["POST", "/sessions/sync"],
      ["POST", "/sessions/abc/kick"],
    ] as const) {
      const res = await app.request(path, { method });
      expect(res.status, `${method} ${path}`).toBe(503);
    }
  });
});

describe("router health", () => {
  it("reports the system resource when the router answers", async () => {
    const app = build({ hotspot: createFakeHotspot().hotspot });
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      reachable: true,
      error: null,
      resource: sampleResource,
    });
  });

  it("reports unreachable rather than failing when the router is down", async () => {
    const fake = createFakeHotspot();
    fake.state.fail = new RouterOsUnavailableError("connect ECONNREFUSED");
    const app = build({ hotspot: fake.hotspot });

    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      reachable: false,
      resource: null,
      error: "connect ECONNREFUSED",
    });
  });
});

describe("hotspot profiles", () => {
  it("lists the profiles configured on the router", async () => {
    const app = build({ hotspot: createFakeHotspot().hotspot });
    const res = await app.request("/profiles");
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ profiles: sampleProfiles });
  });

  it("creates a profile", async () => {
    const fake = createFakeHotspot();
    const app = build({ hotspot: fake.hotspot });

    const res = await app.request("/profiles", {
      method: "POST",
      body: JSON.stringify({
        name: "Saleslip-7d-10",
        rateLimit: "10M/10M",
        sharedUsers: 1,
        sessionTimeout: "7d",
      }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.profile).toMatchObject({
      name: "Saleslip-7d-10",
      rateLimit: "10M/10M",
      sharedUsers: 1,
      sessionTimeout: "7d",
    });
    const created = body.profile as { id?: string };
    expect(created.id).toBeTruthy();
    expect(fake.calls).toContain("createProfile:Saleslip-7d-10");
  });

  it("rejects a profile create with a missing name", async () => {
    const app = build({ hotspot: createFakeHotspot().hotspot });
    const res = await app.request("/profiles", {
      method: "POST",
      body: JSON.stringify({ rateLimit: "5M/5M" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  it("updates a profile by id", async () => {
    const fake = createFakeHotspot();
    const app = build({ hotspot: fake.hotspot });

    const res = await app.request("/profiles/*1", {
      method: "PATCH",
      body: JSON.stringify({ sharedUsers: 4 }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    expect(fake.calls).toContain("updateProfile:*1");
    const list = await app.request("/profiles");
    const body = await json(list);
    const profiles = body.profiles as Record<string, unknown>[];
    expect(profiles[0]).toMatchObject({
      id: "*1",
      name: "Daily-1GB",
      sharedUsers: 4,
    });
  });

  it("removes a profile by id", async () => {
    const fake = createFakeHotspot();
    const app = build({ hotspot: fake.hotspot });

    const res = await app.request("/profiles/*2", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(fake.calls).toContain("removeProfile:*2");
    const list = await app.request("/profiles");
    const body = await json(list);
    expect((body.profiles as { id: string }[]).some((p) => p.id === "*2")).toBe(
      false,
    );
  });
});

describe("attendance board", () => {
  const activatedVoucher = (
    overrides: Partial<repositoryModule.ActivatedVoucherRow> = {},
  ) =>
    ({
      ...voucherRow({
        rosId: "*1",
        activatedAt: new Date("2025-01-15T09:00:00Z"),
      }),
      phone: "+2348012345678",
      amountKobo: 300_000,
      batchLabel: "Counter sheet — 2025-01-15 08:00 UTC",
      ...overrides,
    }) satisfies repositoryModule.ActivatedVoucherRow;

  const boardRepo = (
    vouchers: repositoryModule.ActivatedVoucherRow[],
    params?: { limit?: number; offset?: number },
  ) => ({
    listActivatedVouchers: (input: { limit: number; offset: number }) => {
      if (params) expect(input).toEqual(params);
      return Promise.resolve({ rows: vouchers, total: vouchers.length });
    },
    todaySummary: () => Promise.resolve({ paidOrders: 2, revenueKobo: 60_000 }),
  });

  it("shows a healthy connected voucher green and a disconnected one black", async () => {
    const fake = createFakeHotspot();
    fake.state.active = [
      sampleSession({
        bytesIn: 5_000_000,
        bytesOut: 2_000_000,
        sessionTimeLeft: "23h",
      }),
    ];
    const app = build({
      hotspot: fake.hotspot,
      repo: boardRepo([
        activatedVoucher(),
        activatedVoucher({ id: "voucher-2", code: "OLD-999" }),
      ]),
    });

    const body = await json(await app.request("/sessions"));
    expect(body.routerReachable).toBe(true);
    expect(body.wanReachable).toBe(true);
    expect(body.connected).toBe(1);
    expect(body.total).toBe(2);
    expect(body.revenueKoboToday).toBe(60_000);
    expect(body.rows).toHaveLength(2);
    expect((body.rows as Record<string, unknown>[])[0]).toMatchObject({
      code: "SALE-1234",
      known: true,
      status: "connected",
      indicator: "green",
      reason: null,
      planName: "1 Day Unlimited",
      phone: "+2348012345678",
      batchLabel: "Counter sheet — 2025-01-15 08:00 UTC",
      channel: "manual",
      uptime: "5m",
      sessionTimeLeft: "23h",
      sessionBytes: 7_000_000,
    });
    expect((body.rows as Record<string, unknown>[])[1]).toMatchObject({
      code: "OLD-999",
      status: "disconnected",
      indicator: "black",
      reason: null,
      uptime: null,
    });
  });

  it("marks a session yellow when under an hour is left", async () => {
    const fake = createFakeHotspot();
    fake.state.active = [
      sampleSession({ bytesIn: 5_000_000, sessionTimeLeft: "42m" }),
    ];
    const app = build({
      hotspot: fake.hotspot,
      repo: boardRepo([activatedVoucher()]),
    });

    const body = await json(await app.request("/sessions"));
    expect((body.rows as Record<string, unknown>[])[0]).toMatchObject({
      status: "connected",
      indicator: "yellow",
      reason: "Expires in 42 min",
    });
  });

  it("marks trial-profile vouchers yellow", async () => {
    const fake = createFakeHotspot();
    fake.state.active = [
      sampleSession({ bytesIn: 5_000_000, sessionTimeLeft: "4m" }),
    ];
    const app = build({
      hotspot: fake.hotspot,
      repo: boardRepo([activatedVoucher({ profile: "trial-5m" })]),
    });

    const body = await json(await app.request("/sessions"));
    expect((body.rows as Record<string, unknown>[])[0]).toMatchObject({
      indicator: "yellow",
      reason: "Free trial",
    });
  });

  it("marks a long session with barely any traffic red", async () => {
    const fake = createFakeHotspot();
    fake.state.active = [
      sampleSession({ uptime: "6m", sessionTimeLeft: "20h" }),
    ];
    const app = build({
      hotspot: fake.hotspot,
      repo: boardRepo([activatedVoucher()]),
    });

    const body = await json(await app.request("/sessions"));
    expect((body.rows as Record<string, unknown>[])[0]).toMatchObject({
      indicator: "red",
      reason: "Connected but barely moving data",
    });
  });

  it("marks everyone red when the WAN heartbeat fails", async () => {
    const fake = createFakeHotspot();
    fake.state.wan = false;
    fake.state.active = [
      sampleSession({ bytesIn: 5_000_000, sessionTimeLeft: "23h" }),
    ];
    const app = build({
      hotspot: fake.hotspot,
      repo: boardRepo([activatedVoucher()]),
    });

    const body = await json(await app.request("/sessions"));
    expect(body.wanReachable).toBe(false);
    expect((body.rows as Record<string, unknown>[])[0]).toMatchObject({
      status: "connected",
      indicator: "red",
      reason: "Connected but the internet is down",
    });
  });

  it("appends foreign hotspot users while they are connected", async () => {
    const fake = createFakeHotspot();
    fake.state.active = [
      sampleSession({ bytesIn: 5_000_000, sessionTimeLeft: "23h" }),
      sampleSession({ id: "*2", user: "WALK-IN", bytesIn: 5_000_000 }),
    ];
    const app = build({
      hotspot: fake.hotspot,
      repo: boardRepo([activatedVoucher()]),
    });

    const body = await json(await app.request("/sessions"));
    expect(body.connected).toBe(2);
    expect((body.rows as Record<string, unknown>[])[1]).toMatchObject({
      code: "WALK-IN",
      known: false,
      status: "connected",
      planName: null,
      phone: null,
    });
  });

  it("degrades to an all-black board when the router is unreachable", async () => {
    const fake = createFakeHotspot();
    fake.state.fail = new RouterOsUnavailableError("timeout");
    const app = build({
      hotspot: fake.hotspot,
      repo: boardRepo([activatedVoucher()]),
    });

    const res = await app.request("/sessions");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.routerReachable).toBe(false);
    expect(body.wanReachable).toBe(null);
    expect(body.connected).toBe(0);
    expect((body.rows as Record<string, unknown>[])[0]).toMatchObject({
      status: "disconnected",
      indicator: "black",
    });
  });

  it("degrades the same way when no router is configured", async () => {
    const app = build({
      hotspot: undefined,
      repo: boardRepo([activatedVoucher()]),
    });

    const res = await app.request("/sessions");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.routerReachable).toBe(false);
    expect((body.rows as Record<string, unknown>[])[0]).toMatchObject({
      indicator: "black",
    });
  });

  it("pages the board by limit and offset", async () => {
    const fake = createFakeHotspot();
    const app = build({
      hotspot: fake.hotspot,
      repo: boardRepo([activatedVoucher()], { limit: 25, offset: 25 }),
    });

    const res = await app.request("/sessions?limit=25&offset=25");
    expect(res.status).toBe(200);
  });

  it("kicks a session by username and reports how many went", async () => {
    const fake = createFakeHotspot();
    const app = build({ hotspot: fake.hotspot });

    const res = await app.request("/sessions/SALE-1234/kick", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ kicked: 1 });
    expect(fake.calls).toContain("kick:SALE-1234");
  });

  it("snapshots router usage onto voucher rows", async () => {
    const fake = createFakeHotspot();
    await fake.hotspot.createHotspotUser({
      name: "SALE-1234",
      password: "SALE-1234",
      profile: "Saleslip-1d-1",
    });
    let recorded:
      Map<string, { bytesUsed: number; syncedAt: Date }> | undefined;
    const app = build({
      hotspot: fake.hotspot,
      repo: {
        recordUsage: (usage) => {
          recorded = usage;
          return Promise.resolve(usage.size);
        },
      },
    });

    const res = await app.request("/sessions/sync", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      synced: 1,
      syncedAt: "2025-01-15T10:00:00.000Z",
    });
    expect(recorded?.get("SALE-1234")?.bytesUsed).toBe(0);
  });
});

describe("voucher activation", () => {
  it("mints a batch through the repository, passing the router", async () => {
    const fake = createFakeHotspot();
    const seen: unknown[] = [];
    const app = build({
      hotspot: fake.hotspot,
      repo: {
        createVoucherBatch: (input) => {
          seen.push(input);
          return Promise.resolve({
            batch: { id: "batch-1" } as never,
            vouchers: [voucherRow()],
          });
        },
      },
    });

    const res = await app.request("/vouchers/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planId: "day-1",
        quantity: 2,
        label: "Front desk",
      }),
    });

    expect(res.status).toBe(201);
    expect(await json(res)).toMatchObject({ batch: { id: "batch-1" } });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      label: "Front desk",
      quantity: 2,
      createdBy: "u1",
      channel: "manual",
      hotspot: fake.hotspot,
    });
  });

  it("labels the batch with the current date and time when none is given", async () => {
    const fake = createFakeHotspot();
    const seen: unknown[] = [];
    const app = build({
      hotspot: fake.hotspot,
      repo: {
        createVoucherBatch: (input) => {
          seen.push(input);
          return Promise.resolve({
            batch: { id: "batch-1" } as never,
            vouchers: [voucherRow()],
          });
        },
      },
    });

    const res = await app.request("/vouchers/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: "day-1", quantity: 1 }),
    });

    expect(res.status).toBe(201);
    expect(seen).toHaveLength(1);
    // The injected clock is 2025-01-15T10:00:00Z.
    expect(seen[0]).toMatchObject({ label: "2025-01-15 10:00 UTC" });
  });

  it("404s an unknown plan", async () => {
    const fake = createFakeHotspot();
    const app = build({ hotspot: fake.hotspot });
    const res = await app.request("/vouchers/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: "nope", quantity: 1, label: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("422s when the router refuses the hotspot user", async () => {
    const app = build({
      hotspot: createFakeHotspot().hotspot,
      repo: {
        createVoucherBatch: () =>
          Promise.reject(
            new VoucherActivationError("SALE-1", "no such profile"),
          ),
      },
    });

    const res = await app.request("/vouchers/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: "day-1", quantity: 1, label: "x" }),
    });

    expect(res.status).toBe(422);
    expect(await json(res)).toMatchObject({ error: "no such profile" });
  });

  it("creates the hotspot user and stamps the voucher", async () => {
    const fake = createFakeHotspot();
    const stamped: unknown[] = [];
    const app = build({
      hotspot: fake.hotspot,
      repo: {
        findVoucher: () => Promise.resolve(voucherRow()),
        markActivated: (id, rosId, at) => {
          stamped.push({ id, rosId, at });
          return Promise.resolve(voucherRow({ rosId, activatedAt: at }));
        },
      },
    });

    const res = await app.request("/vouchers/voucher-1/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: "day-1" }),
    });

    expect(res.status).toBe(201);
    expect(await json(res)).toMatchObject({
      voucher: { rosId: "*1", activatedAt: "2025-01-15T10:00:00.000Z" },
    });
    expect(stamped).toHaveLength(1);
    // Username and password are both the code; the comment traces the batch.
    expect(fake.users.get("SALE-1234")).toMatchObject({
      profile: "Saleslip-1d-1",
      comment: "saleslip|batch-1",
      limitBytesTotal: undefined,
    });
  });

  it("409s an already-activated voucher without touching the router", async () => {
    const fake = createFakeHotspot();
    const app = build({
      hotspot: fake.hotspot,
      repo: {
        findVoucher: () =>
          Promise.resolve(
            voucherRow({ activatedAt: new Date("2025-01-15T09:00:00Z") }),
          ),
      },
    });

    const res = await app.request("/vouchers/voucher-1/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: "day-1" }),
    });

    expect(res.status).toBe(409);
    expect(fake.calls).toEqual([]);
  });

  it("records the failure and 422s when the router rejects the command", async () => {
    const fake = createFakeHotspot();
    fake.state.fail = new RouterOsCommandError(
      "/ip/hotspot/user/add",
      "failure: already have user with this name",
    );
    const failures: unknown[] = [];
    const app = build({
      hotspot: fake.hotspot,
      repo: {
        findVoucher: () => Promise.resolve(voucherRow()),
        markActivationFailed: (id, message) => {
          failures.push({ id, message });
          return Promise.resolve(voucherRow({ lastError: message }));
        },
      },
    });

    const res = await app.request("/vouchers/voucher-1/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: "day-1" }),
    });

    expect(res.status).toBe(422);
    expect(failures).toHaveLength(1);
  });

  it("records the failure and 503s when the router is unreachable", async () => {
    const fake = createFakeHotspot();
    fake.state.fail = new RouterOsUnavailableError("timeout");
    const failures: unknown[] = [];
    const app = build({
      hotspot: fake.hotspot,
      repo: {
        findVoucher: () => Promise.resolve(voucherRow()),
        markActivationFailed: (id, message) => {
          failures.push({ id, message });
          return Promise.resolve(voucherRow({ lastError: message }));
        },
      },
    });

    const res = await app.request("/vouchers/voucher-1/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: "day-1" }),
    });

    expect(res.status).toBe(503);
    expect(failures[0]).toMatchObject({ id: "voucher-1", message: "timeout" });
  });

  it("reuses a hotspot user a previous attempt already created", async () => {
    const fake = createFakeHotspot();
    await fake.hotspot.createHotspotUser({
      name: "SALE-1234",
      password: "SALE-1234",
      profile: "Saleslip-1d-1",
    });
    fake.calls.length = 0;
    const app = build({
      hotspot: fake.hotspot,
      repo: {
        findVoucher: () => Promise.resolve(voucherRow()),
        markActivated: (id, rosId, at) =>
          Promise.resolve(voucherRow({ rosId, activatedAt: at })),
      },
    });

    const res = await app.request("/vouchers/voucher-1/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: "day-1" }),
    });

    expect(res.status).toBe(201);
    expect(fake.calls).toEqual(["find:SALE-1234"]);
  });

  it("removes the router user before marking a voucher revoked", async () => {
    const fake = createFakeHotspot();
    await fake.hotspot.createHotspotUser({
      name: "SALE-1234",
      password: "SALE-1234",
      profile: "Saleslip-1d-1",
    });
    fake.calls.length = 0;
    const app = build({
      hotspot: fake.hotspot,
      repo: {
        findVoucher: () => Promise.resolve(voucherRow({ rosId: "*1" })),
        revokeVoucher: () => Promise.resolve(voucherRow({ status: "revoked" })),
      },
    });

    const res = await app.request("/vouchers/voucher-1/revoke", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ voucher: { status: "revoked" } });
    expect(fake.calls).toEqual(["remove:*1"]);
    expect(fake.users.has("SALE-1234")).toBe(false);
  });

  it("leaves the voucher active when the router is down during revoke", async () => {
    const fake = createFakeHotspot();
    fake.state.fail = new RouterOsUnavailableError("timeout");
    let revoked = false;
    const app = build({
      hotspot: fake.hotspot,
      repo: {
        findVoucher: () => Promise.resolve(voucherRow({ rosId: "*1" })),
        revokeVoucher: () => {
          revoked = true;
          return Promise.resolve(voucherRow({ status: "revoked" }));
        },
      },
    });

    const res = await app.request("/vouchers/voucher-1/revoke", {
      method: "POST",
    });
    expect(res.status).toBe(503);
    expect(revoked).toBe(false);
  });
});

describe("voucher deletion", () => {
  it("deletes a revoked voucher without touching the router", async () => {
    const fake = createFakeHotspot();
    fake.calls.length = 0;
    let deleted = false;
    const app = build({
      hotspot: fake.hotspot,
      repo: {
        findVoucherWithOrder: () =>
          Promise.resolve({
            voucher: voucherRow({ status: "revoked" }),
            orderStatus: null,
          }),
        deleteVoucher: () => {
          deleted = true;
          return Promise.resolve(voucherRow({ status: "revoked" }));
        },
      },
    });

    const res = await app.request("/vouchers/voucher-1", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      deleted: true,
      revokedRouterUser: false,
    });
    expect(deleted).toBe(true);
    expect(fake.calls).toEqual([]);
  });

  it("removes a live router user before deleting an active voucher", async () => {
    const fake = createFakeHotspot();
    await fake.hotspot.createHotspotUser({
      name: "SALE-1234",
      password: "SALE-1234",
      profile: "Saleslip-1d-1",
    });
    fake.calls.length = 0;
    const app = build({
      hotspot: fake.hotspot,
      repo: {
        findVoucherWithOrder: () =>
          Promise.resolve({
            voucher: voucherRow({ rosId: "*1" }),
            orderStatus: null,
          }),
        deleteVoucher: () => Promise.resolve(voucherRow()),
      },
    });

    const res = await app.request("/vouchers/voucher-1", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ deleted: true, revokedRouterUser: true });
    expect(fake.calls).toEqual(["find:SALE-1234", "remove:*1"]);
    expect(fake.users.has("SALE-1234")).toBe(false);
  });

  it("deletes an active voucher whose router user is already gone", async () => {
    const fake = createFakeHotspot();
    const app = build({
      hotspot: fake.hotspot,
      repo: {
        findVoucherWithOrder: () =>
          Promise.resolve({
            voucher: voucherRow(),
            orderStatus: null,
          }),
        deleteVoucher: () => Promise.resolve(voucherRow()),
      },
    });

    const res = await app.request("/vouchers/voucher-1", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      deleted: true,
      revokedRouterUser: false,
    });
    expect(fake.calls).toEqual(["find:SALE-1234"]);
  });

  it("refuses to delete a voucher whose order is still awaiting fulfilment", async () => {
    let deleted = false;
    const app = build({
      hotspot: createFakeHotspot().hotspot,
      repo: {
        findVoucherWithOrder: () =>
          Promise.resolve({
            voucher: voucherRow({ orderId: "order-1" }),
            orderStatus: "pending_router",
          }),
        deleteVoucher: () => {
          deleted = true;
          return Promise.resolve(voucherRow());
        },
      },
    });

    const res = await app.request("/vouchers/voucher-1", {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    expect(deleted).toBe(false);
  });

  it("leaves the row when the router is down during delete", async () => {
    const fake = createFakeHotspot();
    fake.state.fail = new RouterOsUnavailableError("timeout");
    let deleted = false;
    const app = build({
      hotspot: fake.hotspot,
      repo: {
        findVoucherWithOrder: () =>
          Promise.resolve({
            voucher: voucherRow({ rosId: "*1" }),
            orderStatus: null,
          }),
        deleteVoucher: () => {
          deleted = true;
          return Promise.resolve(voucherRow());
        },
      },
    });

    const res = await app.request("/vouchers/voucher-1", {
      method: "DELETE",
    });
    expect(res.status).toBe(503);
    expect(deleted).toBe(false);
  });

  it("404s an unknown voucher", async () => {
    const app = build({
      hotspot: createFakeHotspot().hotspot,
      repo: {
        findVoucherWithOrder: () => Promise.resolve(undefined),
      },
    });

    const res = await app.request("/vouchers/nope", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("voucher bulk deletion", () => {
  const activatedVoucherLike = (
    overrides: Partial<repositoryModule.ActivatedVoucherRow> = {},
  ) =>
    ({
      ...voucherRow({
        rosId: "*1",
        activatedAt: new Date("2025-01-15T09:00:00Z"),
      }),
      phone: "+2348012345678",
      amountKobo: 300_000,
      batchLabel: null,
      ...overrides,
    }) satisfies repositoryModule.ActivatedVoucherRow;

  it("settles each voucher independently and reports per-item outcomes", async () => {
    const fake = createFakeHotspot();
    await fake.hotspot.createHotspotUser({
      name: "LIVE-1",
      password: "LIVE-1",
      profile: "Saleslip-1d-1",
    });
    fake.calls.length = 0;

    const rows = new Map<string, repositoryModule.ActivatedVoucherRow>([
      [
        "revoked-1",
        activatedVoucherLike({ id: "revoked-1", status: "revoked" }),
      ],
      ["live-1", activatedVoucherLike({ id: "live-1", code: "LIVE-1" })],
      [
        "inflight-1",
        activatedVoucherLike({ id: "inflight-1", orderId: "order-1" }),
      ],
    ]);
    const deletedIds: string[] = [];
    const app = build({
      hotspot: fake.hotspot,
      repo: {
        findVoucherWithOrder: (id: string) => {
          const row = rows.get(id);
          return Promise.resolve(
            row
              ? {
                  voucher: row,
                  orderStatus: id === "inflight-1" ? "pending_router" : null,
                }
              : undefined,
          );
        },
        deleteVoucher: (id: string) => {
          deletedIds.push(id);
          return Promise.resolve(rows.get(id));
        },
      },
    });

    const res = await app.request("/vouchers/bulk-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ids: ["revoked-1", "live-1", "inflight-1", "ghost-1"],
      }),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.summary).toEqual({
      deleted: 2,
      revokedRouterUsers: 1,
      blocked: 1,
      skippedRouter: 0,
      notFound: 1,
    });
    expect(body.results).toEqual([
      {
        id: "revoked-1",
        code: "SALE-1234",
        outcome: "deleted",
        revokedRouterUser: false,
      },
      {
        id: "live-1",
        code: "LIVE-1",
        outcome: "deleted",
        revokedRouterUser: true,
      },
      {
        id: "inflight-1",
        code: "SALE-1234",
        outcome: "blocked-awaiting-fulfilment",
      },
      { id: "ghost-1", code: null, outcome: "not-found" },
    ]);
    expect(deletedIds).toEqual(["revoked-1", "live-1"]);
    expect(fake.calls).toEqual(["find:LIVE-1", "remove:*1"]);
  });

  it("skips active vouchers but still deletes revoked ones when the router is down", async () => {
    const fake = createFakeHotspot();
    fake.state.fail = new RouterOsUnavailableError("timeout");
    const rows = new Map<string, repositoryModule.ActivatedVoucherRow>([
      [
        "revoked-1",
        activatedVoucherLike({ id: "revoked-1", status: "revoked" }),
      ],
      ["live-1", activatedVoucherLike({ id: "live-1" })],
    ]);
    const deletedIds: string[] = [];
    const app = build({
      hotspot: fake.hotspot,
      repo: {
        findVoucherWithOrder: (id: string) => {
          const row = rows.get(id);
          return Promise.resolve(
            row ? { voucher: row, orderStatus: null } : undefined,
          );
        },
        deleteVoucher: (id: string) => {
          deletedIds.push(id);
          return Promise.resolve(rows.get(id));
        },
      },
    });

    const res = await app.request("/vouchers/bulk-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["revoked-1", "live-1"] }),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.summary).toMatchObject({
      deleted: 1,
      skippedRouter: 1,
    });
    expect(deletedIds).toEqual(["revoked-1"]);
  });

  it("rejects more than 200 ids in one request", async () => {
    const app = build({ hotspot: createFakeHotspot().hotspot });
    const res = await app.request("/vouchers/bulk-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ids: Array.from({ length: 201 }, (_, i) => `v${i}`),
      }),
    });
    expect(res.status).toBe(400);
  });
});
