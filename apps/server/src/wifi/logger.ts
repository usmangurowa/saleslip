type Level = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug: (msg: string, fields?: LogFields) => void;
  info: (msg: string, fields?: LogFields) => void;
  warn: (msg: string, fields?: LogFields) => void;
  error: (msg: string, fields?: LogFields) => void;
  child: (fields: LogFields) => Logger;
}

const serialiseError = (value: unknown) =>
  value instanceof Error
    ? { name: value.name, message: value.message, stack: value.stack }
    : value;

const write = (level: Level, msg: string, fields: LogFields) => {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg,
    ...Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        key === "error" || key === "err" ? serialiseError(value) : value,
      ]),
    ),
  });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
};

/** One JSON object per line so Coolify/Docker log drains stay greppable. */
export const createLogger = (base: LogFields = {}): Logger => ({
  debug: (msg, fields = {}) => write("debug", msg, { ...base, ...fields }),
  info: (msg, fields = {}) => write("info", msg, { ...base, ...fields }),
  warn: (msg, fields = {}) => write("warn", msg, { ...base, ...fields }),
  error: (msg, fields = {}) => write("error", msg, { ...base, ...fields }),
  child: (fields) => createLogger({ ...base, ...fields }),
});

export const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => noopLogger,
};
