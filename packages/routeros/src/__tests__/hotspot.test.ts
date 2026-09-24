import { describe, expect, it, vi } from "vitest";

import type { RouterOsRow, RouterOsTransport } from "../types";
import {
  createHotspotService,
  parseHotspotProfile,
  parseHotspotUser,
  parseSystemResource,
  toHotspotUserParams,
} from "../hotspot";

describe("toHotspotUserParams", () => {
  it("maps the required fields in RouterOS word form", () => {
    expect(
      toHotspotUserParams({
        name: "GW12345",
        password: "GW12345",
        profile: "Daily-Unlimited",
      }),
    ).toEqual([
      "=name=GW12345",
      "=password=GW12345",
      "=profile=Daily-Unlimited",
    ]);
  });

  it("adds comment, byte and uptime limits only when present", () => {
    expect(
      toHotspotUserParams({
        name: "GW12345",
        password: "GW12345",
        profile: "Daily-1GB",
        comment: "saleslip|order-1|08012345678",
        limitBytesTotal: 1_073_741_824.9,
        limitUptime: "1d",
        server: "hotspot1",
      }),
    ).toEqual([
      "=name=GW12345",
      "=password=GW12345",
      "=profile=Daily-1GB",
      "=server=hotspot1",
      "=comment=saleslip|order-1|08012345678",
      "=limit-bytes-total=1073741824",
      "=limit-uptime=1d",
    ]);
  });

  it("drops a zero or negative byte limit (means unlimited)", () => {
    const params = toHotspotUserParams({
      name: "a",
      password: "a",
      profile: "p",
      limitBytesTotal: 0,
    });
    expect(params.some((p) => p.startsWith("=limit-bytes-total"))).toBe(false);
  });
});

describe("row parsers", () => {
  it("parses a hotspot user row", () => {
    const row: RouterOsRow = {
      ".id": "*3",
      name: "GW12345",
      profile: "Daily-1GB",
      "bytes-in": "1024",
      "limit-bytes-total": "1073741824",
      disabled: "false",
    };
    expect(parseHotspotUser(row)).toMatchObject({
      id: "*3",
      name: "GW12345",
      profile: "Daily-1GB",
      bytesIn: 1024,
      limitBytesTotal: 1_073_741_824,
      disabled: false,
    });
  });

  it("parses system resource numbers and tolerates missing keys", () => {
    expect(
      parseSystemResource({ version: "7.19.6", "cpu-load": "3", uptime: "1d" }),
    ).toMatchObject({ version: "7.19.6", cpuLoad: 3, uptime: "1d" });
    expect(parseSystemResource({}).cpuLoad).toBeUndefined();
  });

  it("parses a hotspot user profile row", () => {
    expect(
      parseHotspotProfile({
        ".id": "*5",
        name: "Daily-1GB",
        "rate-limit": "5M/5M",
        "shared-users": "2",
      }),
    ).toMatchObject({
      id: "*5",
      name: "Daily-1GB",
      rateLimit: "5M/5M",
      sharedUsers: 2,
    });
    expect(parseHotspotProfile({ ".id": "*6", name: "default" })).toMatchObject(
      { id: "*6", name: "default", rateLimit: undefined },
    );
  });
});

describe("createHotspotService", () => {
  const makeTransport = (
    responses: Record<string, RouterOsRow[]>,
  ): RouterOsTransport & { write: ReturnType<typeof vi.fn> } => ({
    write: vi.fn((command: string) =>
      Promise.resolve(responses[command] ?? []),
    ),
    close: () => Promise.resolve(),
  });

  it("returns the new .id from an add reply", async () => {
    const transport = makeTransport({
      "/ip/hotspot/user/add": [{ ret: "*1A" }],
    });
    const service = createHotspotService(transport);
    await expect(
      service.createHotspotUser({ name: "x", password: "x", profile: "p" }),
    ).resolves.toEqual({ id: "*1A" });
    expect(transport.write).toHaveBeenCalledWith("/ip/hotspot/user/add", [
      "=name=x",
      "=password=x",
      "=profile=p",
    ]);
  });

  it("kicks every active session for a user", async () => {
    const transport = makeTransport({
      "/ip/hotspot/active/print": [{ ".id": "*1" }, { ".id": "*2" }],
    });
    const service = createHotspotService(transport);
    await expect(service.kick("GW12345")).resolves.toBe(2);
    expect(transport.write).toHaveBeenCalledWith("/ip/hotspot/active/remove", [
      "=.id=*1",
    ]);
    expect(transport.write).toHaveBeenCalledWith("/ip/hotspot/active/remove", [
      "=.id=*2",
    ]);
  });

  it("resolves a username to .id before removing", async () => {
    const transport = makeTransport({
      "/ip/hotspot/user/print": [{ ".id": "*7" }],
    });
    await createHotspotService(transport).removeUser("GW12345");
    expect(transport.write).toHaveBeenLastCalledWith(
      "/ip/hotspot/user/remove",
      ["=.id=*7"],
    );
  });

  it("finds a user by exact name and returns undefined when absent", async () => {
    const transport = makeTransport({
      "/ip/hotspot/user/print": [
        { ".id": "*9", name: "GW12345", profile: "Daily-1GB" },
      ],
    });
    const service = createHotspotService(transport);
    await expect(service.findUser("GW12345")).resolves.toMatchObject({
      id: "*9",
      name: "GW12345",
    });
    expect(transport.write).toHaveBeenCalledWith("/ip/hotspot/user/print", [
      "?name=GW12345",
    ]);
    await expect(
      createHotspotService(makeTransport({})).findUser("nope"),
    ).resolves.toBeUndefined();
  });

  it("lists hotspot user profiles", async () => {
    const transport = makeTransport({
      "/ip/hotspot/user/profile/print": [
        { ".id": "*1", name: "default" },
        { ".id": "*2", name: "Daily-1GB", "rate-limit": "5M/5M" },
      ],
    });
    const service = createHotspotService(transport);
    await expect(service.listProfiles()).resolves.toEqual([
      { id: "*1", name: "default" },
      { id: "*2", name: "Daily-1GB", rateLimit: "5M/5M" },
    ]);
    expect(transport.write).toHaveBeenCalledWith(
      "/ip/hotspot/user/profile/print",
    );
  });
});
