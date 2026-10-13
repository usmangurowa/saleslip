import type { WifiPlanOption } from "@/hooks/use-wifi";
import type { MintedBatch } from "@/hooks/use-wifi-router";
import QRCode from "qrcode";

import { formatNaira } from "@turbo/wifi/format";

/** What the venue prints on every voucher. One venue today, so constants. */
export const VOUCHER_BRAND = {
  logoPath: "/brand/guilders-logo.png",
  wifiName: "Guilders Wifi",
  /** Hotspot `dns-name`; customers type it after joining the network. */
  loginHost: "router.lan",
  supportPhone: "0706 926 5013",
} as const;

/** 3 × 8 cards fill an A4 page inside 10 mm margins, about 63 × 35 mm each. */
export const VOUCHERS_PER_PAGE = 24;

/**
 * One-scan sign-in once the phone is on the WiFi. Username and password are
 * both the code, and the hotspot profile accepts `http-pap`, so a plain GET
 * logs the customer in.
 */
export const hotspotLoginUrl = (code: string): string => {
  const params = new URLSearchParams({ username: code, password: code });
  return `http://${VOUCHER_BRAND.loginHost}/login?${params.toString()}`;
};

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char] ?? char,
  );

type SheetPlan = Pick<WifiPlanOption, "name" | "priceKobo" | "validityLabel">;

export interface VoucherSheetInput {
  title: string;
  plan: SheetPlan;
  /** Absolute URL; the print window has no base to resolve a path against. */
  logoUrl: string;
  vouchers: readonly { code: string; qrSvg: string }[];
}

/** The full print document. Pure, so the layout is testable without a window. */
export const buildVoucherSheetHtml = ({
  title,
  plan,
  logoUrl,
  vouchers,
}: VoucherSheetInput): string => {
  const card = (voucher: VoucherSheetInput["vouchers"][number]) => `
    <div class="card">
      <div class="info">
        <img class="logo" src="${escape(logoUrl)}" alt="" />
        <div class="ssid"><span>WiFi</span> ${escape(VOUCHER_BRAND.wifiName)}</div>
        <div class="code">${escape(voucher.code)}</div>
        <div class="plan">${escape(plan.name)}</div>
        <div class="plan">Valid ${escape(plan.validityLabel)} · ${escape(formatNaira(plan.priceKobo))}</div>
        <div class="help">
          Join ${escape(VOUCHER_BRAND.wifiName)}, open <b>${escape(VOUCHER_BRAND.loginHost)}</b> and enter the code.<br />
          Help: ${escape(VOUCHER_BRAND.supportPhone)}
        </div>
      </div>
      <div class="qr">
        ${voucher.qrSvg}
        <div class="scan">Scan to log in</div>
      </div>
    </div>`;

  const pages: string[] = [];
  for (let i = 0; i < vouchers.length; i += VOUCHERS_PER_PAGE) {
    pages.push(
      `<section class="page">${vouchers
        .slice(i, i + VOUCHERS_PER_PAGE)
        .map(card)
        .join("")}</section>`,
    );
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escape(title)} — voucher sheet</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    color: #111;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: 190mm;
    height: 277mm;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(8, 1fr);
    border-top: 0.2mm dashed #aaa;
    border-left: 0.2mm dashed #aaa;
    break-after: page;
  }
  .page:last-child { break-after: auto; }
  .card {
    display: flex;
    gap: 2mm;
    padding: 2.2mm 2.5mm;
    border-right: 0.2mm dashed #aaa;
    border-bottom: 0.2mm dashed #aaa;
    overflow: hidden;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .logo { height: 4.2mm; width: auto; align-self: flex-start; }
  .ssid { font-size: 7pt; font-weight: 600; margin-top: 1mm; }
  .ssid span { color: #777; font-weight: 400; }
  .code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    margin: 0.6mm 0 0.4mm;
  }
  .plan { font-size: 6.5pt; color: #333; }
  .help { margin-top: auto; font-size: 5.2pt; line-height: 1.3; color: #555; }
  .qr {
    width: 19mm;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .qr svg { width: 19mm; height: 19mm; display: block; }
  .scan { font-size: 5pt; color: #555; margin-top: 0.6mm; }
  @media screen {
    body { background: #eee; padding: 10mm 0; }
    .page { margin: 0 auto 10mm; background: #fff; outline: 10mm solid #fff; }
  }
</style>
</head>
<body>
${pages.join("\n")}
<script>
  // The logo is fetched after write(); printing before it lands drops it.
  window.addEventListener("load", () => { window.focus(); window.print(); });
</script>
</body>
</html>`;
};

/**
 * Open the OS print dialog for a freshly minted voucher sheet.
 *
 * The sheet is written into its own document instead of the current one on
 * purpose: a print window has no dashboard chrome to hide and no CSS cascade to
 * fight, so the printed page is exactly the codes and nothing else. Styles are
 * inlined because the new document does not load the app stylesheet.
 *
 * The window opens before the QR codes render so it stays inside the click's
 * user gesture; popup blockers reject a `window.open` after an `await`.
 */
export const printVoucherSheet = async (
  batch: MintedBatch,
  plan: SheetPlan,
): Promise<void> => {
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return;

  const vouchers = await Promise.all(
    batch.vouchers.map(async (voucher) => ({
      code: voucher.code,
      qrSvg: await QRCode.toString(hotspotLoginUrl(voucher.code), {
        type: "svg",
        margin: 0,
        errorCorrectionLevel: "M",
      }),
    })),
  );

  printWindow.document.write(
    buildVoucherSheetHtml({
      title: batch.batch.label,
      plan,
      logoUrl: `${window.location.origin}${VOUCHER_BRAND.logoPath}`,
      vouchers,
    }),
  );
  printWindow.document.close();
};
