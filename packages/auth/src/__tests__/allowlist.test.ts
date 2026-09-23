import { describe, expect, it } from "vitest";

import { shouldAllowUserCreate } from "../allowlist";

describe("shouldAllowUserCreate", () => {
  it("opens registration when no allowlist is configured", () => {
    expect(shouldAllowUserCreate("anyone@example.com")).toBe(true);
    expect(shouldAllowUserCreate(undefined)).toBe(true);
  });

  it("blocks every email when the allowlist is empty", () => {
    expect(shouldAllowUserCreate("someone@example.com", [])).toBe(false);
  });

  it("admits an allowlisted email case-insensitively", () => {
    expect(
      shouldAllowUserCreate("  Admin@Example.COM  ", ["admin@example.com"]),
    ).toBe(true);
  });

  it("rejects a non-allowlisted email", () => {
    expect(
      shouldAllowUserCreate("intruder@example.com", ["admin@example.com"]),
    ).toBe(false);
  });

  it("rejects a missing email", () => {
    expect(shouldAllowUserCreate(undefined, ["admin@example.com"])).toBe(false);
    expect(shouldAllowUserCreate("", ["admin@example.com"])).toBe(false);
  });
});
