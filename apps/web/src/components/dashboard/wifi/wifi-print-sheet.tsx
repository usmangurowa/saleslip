import type { MintedBatch } from "@/hooks/use-wifi";

/**
 * Open the OS print dialog for a freshly minted voucher sheet.
 *
 * The sheet is written into its own document instead of the current one on
 * purpose: a print window has no dashboard chrome to hide and no CSS cascade to
 * fight, so the printed page is exactly the codes and nothing else. Styles are
 * inlined because the new document does not load the app stylesheet.
 */
export const printVoucherSheet = (
  batch: MintedBatch,
  planName: string,
): void => {
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return;

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

  const cards = batch.vouchers
    .map(
      (voucher) => `
        <div class="card">
          <div class="brand">Saleslip</div>
          <div class="code">${escape(voucher.code)}</div>
          <div class="meta">${escape(planName)}</div>
        </div>`,
    )
    .join("");

  printWindow.document.write(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escape(batch.batch.label)} — voucher sheet</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    color: #111;
  }
  header { margin-bottom: 16px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 0; font-size: 12px; color: #555; }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .card {
    border: 1px dashed #999;
    border-radius: 12px;
    padding: 10px 12px;
    break-inside: avoid;
  }
  .brand {
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #777;
  }
  .code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.06em;
    margin: 4px 0;
  }
  .meta { font-size: 11px; color: #555; }
  @media print {
    body { padding: 0; }
    .card { border-color: #bbb; }
  }
</style>
</head>
<body>
  <header>
    <h1>${escape(batch.batch.label)}</h1>
    <p>${escape(planName)} · ${batch.vouchers.length} ${batch.vouchers.length === 1 ? "voucher" : "vouchers"} · generated ${new Date(batch.batch.createdAt).toLocaleString("en-NG")}</p>
  </header>
  <div class="grid">${cards}</div>
</body>
</html>`);

  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};
