import { describe, expect, it } from "vitest";

import type { WifiPlan } from "../plans";
import type { RandomIndex } from "../voucher-code";
import {
  assertBatchQuantity,
  InvalidBatchQuantityError,
  MAX_BATCH_QUANTITY,
  mintVoucherBatch,
} from "../batch";
import { buildPlans } from "../plans";
import { isVoucherCode } from "../voucher-code";

const planOf = (id: string): WifiPlan => {
  const plan = buildPlans({}).find((candidate) => candidate.id === id);
  if (!plan) throw new Error(`missing plan ${id}`);
  return plan;
};

const dailyPlan = planOf("daily-1gb");

const neverExists = () => Promise.resolve(false);

/** Walks the alphabet one step per call, so every proposal is distinct. */
const incrementingRandom = (): RandomIndex => {
  let cursor = 0;
  return (max) => cursor++ % max;
};

/**
 * Proposes each alphabet index for two consecutive codes, so colliding with a
 * code minted earlier in the same batch is guaranteed.
 */
const collidingRandom = (indices: readonly number[]): RandomIndex => {
  const calls = indices.flatMap((index) =>
    Array.from({ length: 5 }, () => index),
  );
  let cursor = 0;
  return (max) => (calls[cursor++ % calls.length] ?? 0) % max;
};

describe("assertBatchQuantity", () => {
  it("accepts whole numbers in range", () => {
    expect(() => assertBatchQuantity(1)).not.toThrow();
    expect(() => assertBatchQuantity(MAX_BATCH_QUANTITY)).not.toThrow();
  });

  it.each([0, -1, 1.5, MAX_BATCH_QUANTITY + 1, Number.NaN])(
    "rejects %p",
    (quantity) => {
      expect(() => assertBatchQuantity(quantity)).toThrow(
        InvalidBatchQuantityError,
      );
    },
  );
});

describe("mintVoucherBatch", () => {
  it("mints the requested quantity of well-formed, distinct codes", async () => {
    const vouchers = await mintVoucherBatch({
      exists: neverExists,
      quantity: 5,
      plan: dailyPlan,
      random: incrementingRandom(),
    });
    expect(vouchers).toHaveLength(5);
    expect(vouchers.every((v) => isVoucherCode(v.code))).toBe(true);
    expect(new Set(vouchers.map((v) => v.code)).size).toBe(5);
  });

  it("carries the plan profile and byte limit onto every voucher", async () => {
    const vouchers = await mintVoucherBatch({
      exists: neverExists,
      quantity: 2,
      plan: dailyPlan,
      random: incrementingRandom(),
    });
    expect(vouchers.every((v) => v.profile === "Daily-1GB")).toBe(true);
    expect(
      vouchers.every((v) => v.limitBytesTotal === dailyPlan.dataLimitBytes),
    ).toBe(true);
  });

  it("retries when a proposal collides with a code already minted in the batch", async () => {
    const vouchers = await mintVoucherBatch({
      exists: neverExists,
      quantity: 3,
      plan: dailyPlan,
      random: collidingRandom([0, 0, 1, 1, 2]),
    });
    expect(vouchers.map((v) => v.code)).toEqual([
      "GWAAAAA",
      "GWBBBBB",
      "GWCCCCC",
    ]);
  });

  it("rejects an out-of-range quantity before probing the database", async () => {
    let probes = 0;
    await expect(
      mintVoucherBatch({
        exists: () => {
          probes += 1;
          return Promise.resolve(false);
        },
        quantity: 0,
        plan: dailyPlan,
      }),
    ).rejects.toThrow(InvalidBatchQuantityError);
    expect(probes).toBe(0);
  });
});
