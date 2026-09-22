const GB = 1024 ** 3;

export const formatNaira = (kobo: number): string =>
  `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

/** Plan data allowance, where `undefined` means the Mikhmon profile governs. */
export const formatData = (bytes: number | undefined): string =>
  bytes === undefined ? "Unlimited" : `${Math.round(bytes / GB)}GB`;

/**
 * Live usage counter for the sessions and voucher tables, where the value is a
 * running byte total rather than an allowance.
 */
export const formatBytes = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes / 1024;
  let unit: (typeof units)[number] = "KB";
  for (const next of units) {
    unit = next;
    if (value < 1024 || next === "TB") break;
    value /= 1024;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${unit}`;
};

/** Compact validity window, e.g. `7d` for a weekly voucher. */
export const formatExpiry = (expiresAt: Date | null | undefined): string => {
  if (!expiresAt) return "—";
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}d`;
  return `${Math.max(1, Math.floor(ms / 3_600_000))}h`;
};
