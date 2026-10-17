const GB = 1024 ** 3;

export const formatNaira = (kobo: number): string =>
  `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

/** Plan data allowance, where `undefined` means the router profile governs. */
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

/**
 * RouterOS duration (`23h59m16s`, `1d2h`, `45s`, `none`) to milliseconds.
 *
 * `undefined` when the value is absent or unparseable — callers must treat
 * that as "unknown", never as zero: a session with an unknown time-left is
 * not about to expire, and one with unknown uptime has not been up for ages.
 */
export const parseRosDurationMs = (
  value: string | null | undefined,
): number | undefined => {
  if (!value || value === "none") return undefined;
  const match = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match) return undefined;
  const [, days, hours, minutes, seconds] = match;
  if (
    days === undefined &&
    hours === undefined &&
    minutes === undefined &&
    seconds === undefined
  ) {
    return undefined;
  }
  return (
    Number(days ?? 0) * 86_400_000 +
    Number(hours ?? 0) * 3_600_000 +
    Number(minutes ?? 0) * 60_000 +
    Number(seconds ?? 0) * 1_000
  );
};
