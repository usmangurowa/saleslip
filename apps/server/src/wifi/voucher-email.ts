import type { SendEmailResult } from "@turbo/mail/client";
import type { WifiPlan } from "@turbo/wifi";
import { VoucherEmail } from "@turbo/mail";
import { sendEmail } from "@turbo/mail/client";
import { findPlan, formatNaira } from "@turbo/wifi";

import type { WifiOrderRecord, WifiVoucherRecord } from "./orders";

export const VOUCHER_EMAIL_SUBJECT = "Your Saleslip voucher is ready";

/** Device allowance is encoded as the plan id suffix, e.g. `week-2`. */
const deviceCountFromPlan = (plan: WifiPlan): number =>
  Number(plan.id.split("-").at(-1)) || 1;

export interface SendVoucherEmailInput {
  to: string;
  order: WifiOrderRecord;
  voucher: WifiVoucherRecord;
  bonusVoucher?: WifiVoucherRecord | null;
  plans: readonly WifiPlan[];
  supportPhone?: string;
}

/**
 * Receipt-style voucher delivery email, sent on fulfilment when the buyer
 * left an email address. Never throws: the caller treats the result as
 * best-effort and logs failures.
 */
export const sendVoucherEmail = async (
  input: SendVoucherEmailInput,
): Promise<SendEmailResult> => {
  const plan = findPlan(input.plans, input.order.planId);
  if (!plan) {
    return {
      success: false,
      error: new Error(`unknown plan ${input.order.planId}`),
    };
  }

  return sendEmail({
    to: input.to,
    subject: VOUCHER_EMAIL_SUBJECT,
    template: VoucherEmail({
      planName: plan.name,
      priceLabel: formatNaira(input.order.amountKobo),
      validityLabel: plan.validityLabel,
      deviceCount: deviceCountFromPlan(plan),
      code: input.voucher.code,
      bonusCode: input.bonusVoucher?.code,
      supportPhone: input.supportPhone,
    }),
  });
};
