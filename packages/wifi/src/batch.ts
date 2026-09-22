import type { WifiPlan } from "./plans";
import type { RandomIndex } from "./voucher-code";
import { generateUniqueVoucherCode } from "./voucher-code";

/** Upper bound on one minting request; keeps a single response renderable. */
export const MAX_BATCH_QUANTITY = 200;

export interface MintVoucherBatchOptions {
  /** Uniqueness probe against already-issued codes. */
  exists: (code: string) => Promise<boolean>;
  quantity: number;
  plan: WifiPlan;
  attempts?: number;
  random?: RandomIndex;
}

export interface MintedVoucher {
  code: string;
  profile: string;
  limitBytesTotal?: number;
}

export class InvalidBatchQuantityError extends Error {
  constructor(quantity: number) {
    super(
      `quantity must be a whole number between 1 and ${MAX_BATCH_QUANTITY}, got ${quantity}`,
    );
    this.name = "InvalidBatchQuantityError";
  }
}

export const assertBatchQuantity = (quantity: number): void => {
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_BATCH_QUANTITY
  ) {
    throw new InvalidBatchQuantityError(quantity);
  }
};

/**
 * Mint `quantity` distinct codes for one plan.
 *
 * `generateUniqueVoucherCode` only dedupes against codes that already exist in
 * the database, so codes minted earlier in the same call are tracked locally —
 * without this a single batch could hand out the same code twice.
 */
export const mintVoucherBatch = async ({
  exists,
  quantity,
  plan,
  attempts,
  random,
}: MintVoucherBatchOptions): Promise<MintedVoucher[]> => {
  assertBatchQuantity(quantity);
  const issued = new Set<string>();
  const vouchers: MintedVoucher[] = [];
  for (let i = 0; i < quantity; i += 1) {
    const code = await generateUniqueVoucherCode(
      async (candidate) => issued.has(candidate) || (await exists(candidate)),
      { attempts, random },
    );
    issued.add(code);
    vouchers.push({
      code,
      profile: plan.rosProfile,
      limitBytesTotal: plan.dataLimitBytes,
    });
  }
  return vouchers;
};
