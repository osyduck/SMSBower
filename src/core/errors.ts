export type TransportErrorCode = "TIMEOUT" | "NETWORK" | "HTTP_STATUS";

interface SmsBowerTransportErrorOptions {
  cause?: unknown;
  status?: number;
  responseBody?: string;
}

export class SmsBowerTransportError extends Error {
  readonly name = "SmsBowerTransportError";
  readonly code: TransportErrorCode;
  readonly status?: number;
  readonly responseBody?: string;

  constructor(message: string, code: TransportErrorCode, options: SmsBowerTransportErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.status = options.status;
    this.responseBody = options.responseBody;
  }
}
