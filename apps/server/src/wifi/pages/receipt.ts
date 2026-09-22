import { html, raw } from "hono/html";

import type { WifiPlan } from "@turbo/wifi";
import { formatData, formatNaira } from "@turbo/wifi";

import type { WifiOrderRecord, WifiVoucherRecord } from "../orders";
import { layout } from "./layout";

export interface ReceiptPageProps {
  brandName: string;
  supportPhone?: string;
  order: WifiOrderRecord;
  plan: WifiPlan | undefined;
  voucher: WifiVoucherRecord | undefined;
  /** Inline SVG for the voucher code; omitted while still pending. */
  qrSvg?: string;
  timeZone?: string;
}

export const CONNECT_DST = "http://neverssl.com";

const formatTime = (date: Date, timeZone?: string) =>
  date.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });

const statusBadge = (status: WifiOrderRecord["status"]) => {
  switch (status) {
    case "fulfilled":
      return html`<span class="badge ok">Paid · voucher ready</span>`;
    case "paid":
    case "pending_router":
      return html`<span class="badge warn">Paid · preparing voucher</span>`;
    case "failed":
      return html`<span class="badge err">Payment problem</span>`;
    default:
      return html`<span class="badge warn">Waiting for payment</span>`;
  }
};

const POLL_SCRIPT = `
(function () {
  var id = document.body.getAttribute("data-order");
  var delay = 3000;
  function tick() {
    fetch("/orders/" + id + "/status", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (s) {
        if (s.status === "fulfilled" || s.status === "failed") location.reload();
        else setTimeout(tick, delay);
      })
      .catch(function () { setTimeout(tick, delay * 2); });
  }
  setTimeout(tick, delay);
})();
`;

export const receiptPage = (props: ReceiptPageProps) => {
  const { order, plan, voucher } = props;
  const isFinal = order.status === "fulfilled" || order.status === "failed";
  const ready = order.status === "fulfilled" && voucher;

  const head = isFinal
    ? undefined
    : html`<meta http-equiv="refresh" content="5" />
        <script>
          ${raw(POLL_SCRIPT)};
        </script>`;

  return layout(
    {
      title: ready ? "Your WiFi code" : "Order status",
      brandName: props.brandName,
      head,
      bodyData: { order: order.id },
    },
    html`
      <div class="card" style="text-align:center">
        ${statusBadge(order.status)}
        ${
          ready
            ? html`
                <h1 style="margin-top:12px">Your WiFi code</h1>
                <div class="code" aria-label="Voucher code">
                  ${voucher.code}
                </div>
                ${props.qrSvg ? html`<div class="qr">${raw(props.qrSvg)}</div>` : ""}
                <p class="muted">
                  Username and password are both this code. Keep this page or
                  take a screenshot.
                </p>
              `
            : order.status === "failed"
              ? html`
                  <h1 style="margin-top:12px">
                    We could not complete this order
                  </h1>
                  <p class="muted">
                    If you were charged, your money is safe. Contact support
                    with order <strong>${order.id.slice(0, 8)}</strong> and we
                    will sort it out.
                  </p>
                `
              : html`
                  <h1 style="margin-top:12px">
                    ${
                      order.status === "pending"
                        ? "Waiting for your payment"
                        : "Payment received — preparing your code"
                    }
                  </h1>
                  <p class="muted">
                    This page refreshes automatically. It usually takes under a
                    minute.
                  </p>
                `
        }
      </div>

      ${
        ready && order.loginUrl
          ? html`
              <form
                class="no-print"
                method="post"
                action="${order.loginUrl}"
                style="margin-bottom:12px"
              >
                <input type="hidden" name="username" value="${voucher.code}" />
                <input type="hidden" name="password" value="${voucher.code}" />
                <input type="hidden" name="dst" value="${CONNECT_DST}" />
                <button class="btn" type="submit">Connect now</button>
              </form>
            `
          : ready
            ? html`
                <div class="card no-print">
                  <h2>How to connect</h2>
                  <p class="muted">
                    Join the <strong>${props.brandName}</strong> WiFi, open the
                    login page and enter <strong>${voucher.code}</strong> as
                    both username and password.
                  </p>
                </div>
              `
            : ""
      }

      <div class="card">
        <h2>Receipt</h2>
        <dl>
          <dt>Plan</dt>
          <dd>${plan?.name ?? order.planId}</dd>
          <dt>Data</dt>
          <dd>${formatData(plan?.dataLimitBytes)}</dd>
          <dt>Validity</dt>
          <dd>${plan?.validityLabel ?? "—"}</dd>
          <dt>Amount</dt>
          <dd>${formatNaira(order.amountKobo)}</dd>
          <dt>Phone</dt>
          <dd>${order.phone}</dd>
          <dt>Time</dt>
          <dd>
            ${formatTime(order.paidAt ?? order.createdAt, props.timeZone)}
          </dd>
          <dt>Order</dt>
          <dd style="font-family:ui-monospace,monospace">
            ${order.id.slice(0, 8)}
          </dd>
        </dl>
      </div>

      ${
        ready
          ? html`<button
              class="btn secondary no-print"
              type="button"
              onclick="window.print()"
            >
              Print receipt
            </button>`
          : ""
      }
      ${
        props.supportPhone
          ? html`<p class="muted" style="text-align:center;margin-top:12px">
              Support:
              <a href="tel:${props.supportPhone}">${props.supportPhone}</a>
            </p>`
          : ""
      }
    `,
  );
};
