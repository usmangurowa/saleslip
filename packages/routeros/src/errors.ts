/**
 * Thrown for every transport-level failure (connect refused, timeout, socket
 * closed, login rejected). Callers treat it as "router unreachable" and retry
 * later; the message never contains credentials.
 */
export class RouterOsUnavailableError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "RouterOsUnavailableError";
    this.cause = cause;
  }
}

/**
 * Thrown when the router accepted the connection but rejected the command
 * (`!trap`), for example a duplicate hotspot user or unknown profile.
 * Retrying will not help; the caller must change the request.
 */
export class RouterOsCommandError extends Error {
  readonly command: string;

  constructor(command: string, message: string) {
    super(message);
    this.name = "RouterOsCommandError";
    this.command = command;
  }
}

export const isRouterOsUnavailable = (
  error: unknown,
): error is RouterOsUnavailableError =>
  error instanceof RouterOsUnavailableError;
