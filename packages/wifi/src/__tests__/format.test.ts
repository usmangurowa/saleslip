import { describe, expect, it } from "vitest";

import { parseRosDurationMs } from "../format";

describe("parseRosDurationMs", () => {
  it("parses every RouterOS unit", () => {
    expect(parseRosDurationMs("45s")).toBe(45_000);
    expect(parseRosDurationMs("5m")).toBe(300_000);
    expect(parseRosDurationMs("2h")).toBe(7_200_000);
    expect(parseRosDurationMs("1d")).toBe(86_400_000);
    expect(parseRosDurationMs("23h59m16s")).toBe(
      23 * 3_600_000 + 59 * 60_000 + 16_000,
    );
    expect(parseRosDurationMs("1d2h3m4s")).toBe(
      86_400_000 + 7_200_000 + 180_000 + 4_000,
    );
  });

  it("treats absent, none and garbage as unknown, never zero", () => {
    expect(parseRosDurationMs(undefined)).toBeUndefined();
    expect(parseRosDurationMs(null)).toBeUndefined();
    expect(parseRosDurationMs("")).toBeUndefined();
    expect(parseRosDurationMs("none")).toBeUndefined();
    expect(parseRosDurationMs("soon")).toBeUndefined();
    expect(parseRosDurationMs("5x")).toBeUndefined();
  });
});
