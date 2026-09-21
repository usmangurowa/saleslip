import type {
  HotspotActiveSession,
  HotspotUser,
  HotspotUserInput,
  RouterOsRow,
  RouterOsTransport,
  SystemResource,
} from "./types";

const toInt = (value: string | undefined): number | undefined => {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Map a hotspot user request onto RouterOS `/ip/hotspot/user/add` words.
 * Pure so the plan → user mapping can be unit tested without a router.
 */
export const toHotspotUserParams = (input: HotspotUserInput): string[] => {
  const params = [
    `=name=${input.name}`,
    `=password=${input.password}`,
    `=profile=${input.profile}`,
  ];
  if (input.server) params.push(`=server=${input.server}`);
  if (input.comment) params.push(`=comment=${input.comment}`);
  if (input.limitBytesTotal !== undefined && input.limitBytesTotal > 0) {
    params.push(`=limit-bytes-total=${Math.floor(input.limitBytesTotal)}`);
  }
  if (input.limitUptime) params.push(`=limit-uptime=${input.limitUptime}`);
  return params;
};

export const parseHotspotUser = (row: RouterOsRow): HotspotUser => ({
  id: row[".id"] ?? "",
  name: row.name ?? "",
  profile: row.profile ?? "default",
  comment: row.comment,
  disabled: row.disabled === "true",
  uptime: row.uptime,
  bytesIn: toInt(row["bytes-in"]),
  bytesOut: toInt(row["bytes-out"]),
  limitBytesTotal: toInt(row["limit-bytes-total"]),
  limitUptime: row["limit-uptime"],
});

export const parseActiveSession = (row: RouterOsRow): HotspotActiveSession => ({
  id: row[".id"] ?? "",
  user: row.user ?? "",
  address: row.address,
  macAddress: row["mac-address"],
  uptime: row.uptime,
  bytesIn: toInt(row["bytes-in"]),
  bytesOut: toInt(row["bytes-out"]),
});

export const parseSystemResource = (row: RouterOsRow): SystemResource => ({
  uptime: row.uptime,
  version: row.version,
  boardName: row["board-name"],
  cpuLoad: toInt(row["cpu-load"]),
  freeMemory: toInt(row["free-memory"]),
  totalMemory: toInt(row["total-memory"]),
  freeHddSpace: toInt(row["free-hdd-space"]),
  totalHddSpace: toInt(row["total-hdd-space"]),
});

export interface HotspotService {
  /** Adds the user and returns its RouterOS `.id`. */
  createHotspotUser: (input: HotspotUserInput) => Promise<{ id: string }>;
  listUsers: () => Promise<HotspotUser[]>;
  listActive: () => Promise<HotspotActiveSession[]>;
  /** Removes a hotspot user by RouterOS `.id` or by name. */
  removeUser: (idOrName: string) => Promise<void>;
  /** Drops every active session for the given username. */
  kick: (username: string) => Promise<number>;
  systemResource: () => Promise<SystemResource>;
}

export const createHotspotService = (
  transport: RouterOsTransport,
): HotspotService => ({
  async createHotspotUser(input) {
    const rows = await transport.write(
      "/ip/hotspot/user/add",
      toHotspotUserParams(input),
    );
    // `add` answers `!done =ret=*1A`; node-routeros surfaces it as `{ ret }`.
    const id = rows.find((row) => row.ret)?.ret ?? "";
    return { id };
  },

  async listUsers() {
    const rows = await transport.write("/ip/hotspot/user/print");
    return rows.map(parseHotspotUser);
  },

  async listActive() {
    const rows = await transport.write("/ip/hotspot/active/print");
    return rows.map(parseActiveSession);
  },

  async removeUser(idOrName) {
    const target = idOrName.startsWith("*")
      ? idOrName
      : (
          await transport.write("/ip/hotspot/user/print", [
            `?name=${idOrName}`,
            "=.proplist=.id",
          ])
        )[0]?.[".id"];
    if (!target) return;
    await transport.write("/ip/hotspot/user/remove", [`=.id=${target}`]);
  },

  async kick(username) {
    const rows = await transport.write("/ip/hotspot/active/print", [
      `?user=${username}`,
      "=.proplist=.id",
    ]);
    for (const row of rows) {
      const id = row[".id"];
      if (id)
        await transport.write("/ip/hotspot/active/remove", [`=.id=${id}`]);
    }
    return rows.length;
  },

  async systemResource() {
    const rows = await transport.write("/system/resource/print");
    return parseSystemResource(rows[0] ?? {});
  },
});
