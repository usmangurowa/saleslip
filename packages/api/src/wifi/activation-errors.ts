/**
 * Activation failures, distinguished by whether retrying could ever help.
 *
 * The console mints a sheet and hands it to a customer, so the error a route
 * returns has to tell the operator which of two very different things happened:
 * the router refused the request (fix the plan or the code), or the router was
 * never reached (nothing was created; try again in a moment).
 */

/** The router answered but rejected the hotspot user (bad profile, duplicate). */
export class VoucherActivationError extends Error {
  readonly code: string;
  /** RouterOS command that was refused, for the log. */
  readonly command?: string;

  constructor(code: string, message: string, command?: string) {
    super(message);
    this.name = "VoucherActivationError";
    this.code = code;
    this.command = command;
  }
}

/** The router could not be reached, so nothing was activated. */
export class VoucherActivationUnavailableError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "VoucherActivationUnavailableError";
    this.code = code;
  }
}
