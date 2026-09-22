import { randomInt } from "node:crypto";

export const VOUCHER_PREFIX = "GW";
export const VOUCHER_BODY_LENGTH = 5;

/** Uppercase alphanumerics minus the glyphs people confuse when typing. */
export const VOUCHER_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const CODE_PATTERN = new RegExp(
  `^${VOUCHER_PREFIX}[${VOUCHER_ALPHABET}]{${VOUCHER_BODY_LENGTH}}$`,
);

export type RandomIndex = (maxExclusive: number) => number;

export const generateVoucherCode = (
  random: RandomIndex = (max) => randomInt(max),
): string => {
  let body = "";
  for (let i = 0; i < VOUCHER_BODY_LENGTH; i += 1) {
    body += VOUCHER_ALPHABET[random(VOUCHER_ALPHABET.length)];
  }
  return `${VOUCHER_PREFIX}${body}`;
};

export const isVoucherCode = (value: string): boolean =>
  CODE_PATTERN.test(value);

/** Accepts sloppy input (lowercase, spaces, dashes) and normalises it. */
export const normaliseVoucherCode = (value: string): string =>
  value.toUpperCase().replace(/[\s-]/g, "");

export class VoucherCodeExhaustedError extends Error {
  constructor(attempts: number) {
    super(`could not find a unique voucher code after ${attempts} attempts`);
    this.name = "VoucherCodeExhaustedError";
  }
}

export const generateUniqueVoucherCode = async (
  exists: (code: string) => Promise<boolean>,
  options: { attempts?: number; random?: RandomIndex } = {},
): Promise<string> => {
  const attempts = options.attempts ?? 10;
  for (let i = 0; i < attempts; i += 1) {
    const code = generateVoucherCode(options.random);
    if (!(await exists(code))) return code;
  }
  throw new VoucherCodeExhaustedError(attempts);
};
