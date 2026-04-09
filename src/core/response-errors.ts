export const SMSBOWER_API_ERROR_CODES = [
  "BAD_KEY",
  "BAD_ACTION",
  "BAD_SERVICE",
  "BAD_STATUS",
  "NO_ACTIVATION",
  "EARLY_CANCEL_DENIED",
  "BAD_COUNTRY",
] as const;

export type SmsBowerApiErrorCode = (typeof SMSBOWER_API_ERROR_CODES)[number];
export type SmsBowerParseErrorCode = "UNKNOWN_TOKEN" | "MALFORMED_JSON";

interface SmsBowerResponseErrorOptions {
  cause?: unknown;
  token?: string;
}

const API_ERROR_MESSAGES: Record<SmsBowerApiErrorCode, string> = {
  BAD_KEY: "SMSBower rejected the API key.",
  BAD_ACTION: "SMSBower rejected the action.",
  BAD_SERVICE: "SMSBower rejected the service code.",
  BAD_STATUS: "SMSBower rejected the activation status change.",
  NO_ACTIVATION: "SMSBower could not find an activation for this request.",
  EARLY_CANCEL_DENIED: "SMSBower denied cancellation because it is too early in the activation lifecycle.",
  BAD_COUNTRY: "SMSBower rejected the country code.",
};

const API_ERROR_BY_TOKEN: Record<string, SmsBowerApiErrorCode> = {
  BAD_KEY: "BAD_KEY",
  BAD_ACTION: "BAD_ACTION",
  BAD_SERVICE: "BAD_SERVICE",
  BAD_STATUS: "BAD_STATUS",
  NO_ACTIVATION: "NO_ACTIVATION",
  EARLY_CANCEL_DENIED: "EARLY_CANCEL_DENIED",
  BAD_COUNTRY: "BAD_COUNTRY",
};

export class SmsBowerApiError extends Error {
  readonly name = "SmsBowerApiError";
  readonly code: SmsBowerApiErrorCode;
  readonly token: string;
  readonly rawResponse: string;

  constructor(code: SmsBowerApiErrorCode, rawResponse: string, options: SmsBowerResponseErrorOptions = {}) {
    super(API_ERROR_MESSAGES[code], options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.token = options.token ?? code;
    this.rawResponse = rawResponse;
  }
}

export class SmsBowerParseError extends Error {
  readonly name = "SmsBowerParseError";
  readonly code: SmsBowerParseErrorCode;
  readonly token?: string;
  readonly rawResponse: string;

  constructor(
    code: SmsBowerParseErrorCode,
    message: string,
    rawResponse: string,
    options: SmsBowerResponseErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.token = options.token;
    this.rawResponse = rawResponse;
  }
}

export const resolveApiErrorCodeFromToken = (token: string): SmsBowerApiErrorCode | undefined => {
  return API_ERROR_BY_TOKEN[token];
};
