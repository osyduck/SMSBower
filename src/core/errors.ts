export type TransportErrorCode = "TIMEOUT" | "NETWORK" | "HTTP_STATUS";

interface SmsBowerTransportErrorOptions {
  cause?: unknown;
  status?: number;
}

export class SmsBowerTransportError extends Error {
  readonly name = "SmsBowerTransportError";
  readonly code: TransportErrorCode;
  readonly status?: number;

  constructor(message: string, code: TransportErrorCode, options: SmsBowerTransportErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.status = options.status;
  }
}

export const isAbortError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === "AbortError";
};
