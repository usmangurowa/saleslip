import type { HtmlEscapedString } from "hono/utils/html";
import { html, raw } from "hono/html";

export interface LayoutOptions {
  title: string;
  brandName: string;
  /** Extra `<head>` markup (meta refresh, inline scripts). */
  head?: HtmlEscapedString | Promise<HtmlEscapedString>;
  /** `data-*` attributes on `<body>` for inline scripts to read. */
  bodyData?: Record<string, string>;
}

/**
 * Hand-rolled styles: the captive portal's walled garden only admits our own
 * host, so no CDN stylesheets can load before the buyer has a voucher.
 */
const STYLES = `
  :root {
    --bg: #f5f6f8; --card: #ffffff; --ink: #111827; --muted: #6b7280;
    --brand: #0f766e; --brand-ink: #ffffff; --line: #e5e7eb;
    --ok: #166534; --ok-bg: #dcfce7; --warn: #92400e; --warn-bg: #fef3c7;
    --err: #991b1b; --err-bg: #fee2e2;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 1rem/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  header { background: var(--brand); color: var(--brand-ink); padding: 14px 16px; }
  header .brand { font-weight: 600; font-size: 1rem; letter-spacing: -0.15px; }
  main { max-width: 480px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 1.5rem; line-height: 1.25; letter-spacing: -0.15px; margin: 8px 0 12px; }
  h2 { font-size: 1rem; font-weight: 600; margin: 0 0 6px; }
  p { margin: 0 0 10px; }
  .muted { color: var(--muted); font-size: 0.875rem; }
  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: 0.75rem;
    padding: 16px; margin-bottom: 12px;
  }
  .plan { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .plan .price { font-weight: 600; font-size: 1rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .btn {
    display: block; width: 100%; padding: 14px 16px; border: 0; border-radius: 0.625rem;
    background: var(--brand); color: var(--brand-ink); font-size: 1rem; font-weight: 600;
    text-align: center; text-decoration: none; cursor: pointer;
  }
  .btn.secondary { background: #e5e7eb; color: var(--ink); }
  .btn + .btn { margin-top: 8px; }
  label { display: block; font-size: 0.875rem; font-weight: 500; margin: 12px 0 4px; }
  input[type=tel], input[type=email] {
    width: 100%; padding: 12px; font-size: 1rem; border: 1px solid var(--line);
    border-radius: 0.625rem; background: #fff;
  }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; }
  .badge.ok { background: var(--ok-bg); color: var(--ok); }
  .badge.warn { background: var(--warn-bg); color: var(--warn); }
  .badge.err { background: var(--err-bg); color: var(--err); }
  .code {
    font: 600 3rem/1.1 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: .08em; text-align: center; padding: 16px 0; word-break: break-all;
  }
  .qr { display: flex; justify-content: center; margin: 8px 0 12px; }
  .qr svg { width: 160px; height: 160px; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; font-size: 0.875rem; }
  dt { color: var(--muted); }
  dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
  .error { background: var(--err-bg); color: var(--err); border-radius: 0.625rem; padding: 10px 12px; margin-bottom: 12px; }
  footer { text-align: center; padding: 16px; }
  @media print {
    body { background: #fff; }
    header, .no-print, footer { display: none !important; }
    .card { border: 1px dashed #999; break-inside: avoid; }
    main { max-width: none; padding: 0; }
  }
`;

export const layout = (
  options: LayoutOptions,
  body: HtmlEscapedString | Promise<HtmlEscapedString>,
) =>
  html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>${options.title} · ${options.brandName}</title>
        <style>
          ${raw(STYLES)}
        </style>
        ${options.head ?? ""}
      </head>
      <body
        ${Object.entries(options.bodyData ?? {}).map(
        ([key, value]) => html`data-${key}="${value}" `,
      )}
      >
        <header><div class="brand">${options.brandName}</div></header>
        <main>${body}</main>
        <footer class="muted">Powered by SaleSlip</footer>
      </body>
    </html>`;
