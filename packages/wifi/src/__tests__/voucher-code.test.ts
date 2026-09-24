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
  it("produces SL + 5 characters from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateVoucherCode();
      expect(code).toMatch(/^SL[A-Z2-9]{5}$/);
      for (const ch of code.slice(VOUCHER_PREFIX.length)) {
        expect(VOUCHER_ALPHABET).toContain(ch);
      }
    }
  });

  it("never emits ambiguous characters", () => {
    expect(VOUCHER_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("is deterministic given the random source", () => {
    expect(generateVoucherCode(() => 0)).toBe("SLAAAAA");
    expect(generateVoucherCode(() => VOUCHER_ALPHABET.length - 1)).toBe(
      "SL99999",
    );
  });
});

describe("isVoucherCode / normaliseVoucherCode", () => {
  it("accepts well-formed codes and rejects others", () => {
    expect(isVoucherCode("SLAB2C3")).toBe(true);
    expect(isVoucherCode("SLAB2C")).toBe(false);
    expect(isVoucherCode("XXAB2C3")).toBe(false);
    expect(isVoucherCode("SLAB0C3")).toBe(false);
  });

  it("normalises user input", () => {
    expect(normaliseVoucherCode(" sl-ab2 c3 ")).toBe("SLAB2C3");
  });
});

describe("generateUniqueVoucherCode", () => {
  it("retries until the code is unused", async () => {
    let calls = 0;
    const code = await generateUniqueVoucherCode(
      (candidate) => Promise.resolve(candidate === "SLAAAAA"),
      { random: () => (calls++ < 5 ? 0 : 1) },
    );
    expect(code).toBe("SLBBBBB");
  });

  it("throws once the attempt budget is exhausted", async () => {
    await expect(
      generateUniqueVoucherCode(() => Promise.resolve(true), { attempts: 3 }),
    ).rejects.toBeInstanceOf(VoucherCodeExhaustedError);
  });
});
