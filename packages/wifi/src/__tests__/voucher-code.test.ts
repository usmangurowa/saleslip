import { describe, expect, it } from "vitest";

import {
  generateUniqueVoucherCode,
  generateVoucherCode,
  isVoucherCode,
  normaliseVoucherCode,
  VOUCHER_ALPHABET,
  VOUCHER_PREFIX,
  VoucherCodeExhaustedError,
} from "../voucher-code";

describe("generateVoucherCode", () => {
  it("produces GW + 5 characters from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateVoucherCode();
      expect(code).toMatch(/^GW[A-Z2-9]{5}$/);
      for (const ch of code.slice(VOUCHER_PREFIX.length)) {
        expect(VOUCHER_ALPHABET).toContain(ch);
      }
    }
  });

  it("never emits ambiguous characters", () => {
    expect(VOUCHER_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("is deterministic given the random source", () => {
    expect(generateVoucherCode(() => 0)).toBe("GWAAAAA");
    expect(generateVoucherCode(() => VOUCHER_ALPHABET.length - 1)).toBe(
      "GW99999",
    );
  });
});

describe("isVoucherCode / normaliseVoucherCode", () => {
  it("accepts well-formed codes and rejects others", () => {
    expect(isVoucherCode("GWAB2C3")).toBe(true);
    expect(isVoucherCode("GWAB2C")).toBe(false);
    expect(isVoucherCode("XXAB2C3")).toBe(false);
    expect(isVoucherCode("GWAB0C3")).toBe(false);
  });

  it("normalises user input", () => {
    expect(normaliseVoucherCode(" gw-ab2 c3 ")).toBe("GWAB2C3");
  });
});

describe("generateUniqueVoucherCode", () => {
  it("retries until the code is unused", async () => {
    let calls = 0;
    const code = await generateUniqueVoucherCode(
      (candidate) => Promise.resolve(candidate === "GWAAAAA"),
      { random: () => (calls++ < 5 ? 0 : 1) },
    );
    expect(code).toBe("GWBBBBB");
  });

  it("throws once the attempt budget is exhausted", async () => {
    await expect(
      generateUniqueVoucherCode(() => Promise.resolve(true), { attempts: 3 }),
    ).rejects.toBeInstanceOf(VoucherCodeExhaustedError);
  });
});
