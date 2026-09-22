import { html } from "hono/html";

import type { WifiPlan } from "@turbo/wifi";
import { formatData, formatNaira } from "@turbo/wifi";

import { layout } from "./layout";

export interface PortalParams {
  mac?: string;
  ip?: string;
  login?: string;
}

export interface BuyPageProps {
  brandName: string;
  supportPhone?: string;
  plans: readonly WifiPlan[];
  portal: PortalParams;
  error?: string;
  /** Pre-filled values after a validation error. */
  values?: { planId?: string; phone?: string; email?: string };
}

const hidden = (name: string, value: string | undefined) =>
  value ? html`<input type="hidden" name="${name}" value="${value}" />` : "";

export const buyPage = (props: BuyPageProps) =>
  layout(
    { title: "Buy WiFi", brandName: props.brandName },
    html`
      <h1>Buy a WiFi voucher</h1>
      <p class="muted">
        Pay with bank transfer, USSD or card. Your code appears here and works
        immediately.
      </p>
      ${props.error ? html`<div class="error" role="alert">${props.error}</div>` : ""}
      <form method="post" action="/orders" class="card">
        ${hidden("mac", props.portal.mac)} ${hidden("ip", props.portal.ip)}
        ${hidden("login", props.portal.login)}
        <h2>1. Choose a plan</h2>
        ${props.plans.map(
          (plan, index) => html`
            <label class="plan" style="margin:8px 0;font-weight:400">
              <span style="display:flex;gap:10px;align-items:flex-start">
                <input
                  type="radio"
                  name="planId"
                  value="${plan.id}"
                  required
                  ${
                    (props.values?.planId ?? props.plans[0]?.id) === plan.id ||
                    (!props.values?.planId && index === 0)
                      ? "checked"
                      : ""
                  }
                  style="margin-top:5px"
                />
                <span>
                  <strong>${plan.name}</strong><br />
                  <span class="muted"
                    >${formatData(plan.dataLimitBytes)} ·
                    ${plan.validityLabel}</span
                  >
                </span>
              </span>
              <span class="price">${formatNaira(plan.priceKobo)}</span>
            </label>
          `,
        )}
        <h2 style="margin-top:16px">2. Your details</h2>
        <label for="phone">Phone number</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          placeholder="0801 234 5678"
          required
          value="${props.values?.phone ?? ""}"
        />
        <label for="email"
          >Email <span class="muted">(optional, for receipt)</span></label
        >
        <input
          id="email"
          name="email"
          type="email"
          autocomplete="email"
          placeholder="you@example.com"
          value="${props.values?.email ?? ""}"
        />
        <div style="height:16px"></div>
        <button class="btn" type="submit">Continue to payment</button>
      </form>
      ${
        props.supportPhone
          ? html`<p class="muted" style="text-align:center">
              Need help? Call or WhatsApp
              <a href="tel:${props.supportPhone}">${props.supportPhone}</a>
            </p>`
          : ""
      }
    `,
  );

export const unavailablePage = (brandName: string, supportPhone?: string) =>
  layout(
    { title: "Unavailable", brandName },
    html`
      <div class="card">
        <h1>Payments are temporarily unavailable</h1>
        <p>Please try again in a few minutes.</p>
        ${
          supportPhone
            ? html`<p class="muted">
                Or buy a voucher directly:
                <a href="tel:${supportPhone}">${supportPhone}</a>
              </p>`
            : ""
        }
      </div>
    `,
  );
